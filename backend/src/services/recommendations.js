// ============================================================
// PERSONALISED RECOMMENDATIONS
//
// Content-based scoring over genres. Signals are gathered from wherever
// they physically live — profile + watchlist + history from the user's
// home region, reviews from every region's review node (scatter-gather) —
// and candidates come from the catalog licensed in the region the user is
// currently in. Any signal source that is unreachable is skipped, so
// recommendations degrade instead of failing (availability).
// ============================================================
const { REGION_CODES } = require('../config/topology');
const { callRegion } = require('./rpc');
const movies = require('./movies');

async function forUser(region, user, limit = 20) {
  const degraded = [];
  const safe = async (label, promise, fallback) => {
    try {
      return await promise;
    } catch (err) {
      degraded.push(`${label}: ${err.message}`);
      return fallback;
    }
  };

  const [profile, list, history, reviewsByRegion] = await Promise.all([
    safe('profile', callRegion(user.home_region, 'user.getProfile', { user }), null),
    safe('watchlist', callRegion(user.home_region, 'watchlist.list', { user }), []),
    safe('history', callRegion(user.home_region, 'watchlist.history', { user }), []),
    Promise.all(REGION_CODES.map((r) => safe(`reviews@${r}`, callRegion(r, 'reviews.byUser', { region: r, userId: user.sub }), []))),
  ]);
  const myReviews = reviewsByRegion.flat();

  const weights = {};
  const bump = (genres, w) => (genres || []).forEach((g) => { weights[g] = (weights[g] || 0) + w; });

  bump(profile?.preferences?.favoriteGenres, 3);
  list.forEach((item) => bump(item.genres, 2));
  history.forEach((h) => bump(h.genres, h.event === 'completed' ? 2 : 1));

  const reviewedMovies = await movies.getMoviesByIds(region, myReviews.map((r) => r.movie_id));
  const genresById = new Map(reviewedMovies.map((m) => [m.content_id, m.genres]));
  myReviews.forEach((r) => {
    const w = r.rating >= 4 ? 2 : r.rating <= 2 ? -2 : 0;
    if (w) bump(genresById.get(Number(r.movie_id)), w);
  });

  const seen = new Set([
    ...list.map((i) => Number(i.content_id)),
    ...history.map((h) => Number(h.content_id)),
    ...myReviews.map((r) => Number(r.movie_id)),
  ]);

  const { rows: candidates } = await movies.scatter(region, 'SELECT * FROM movies ORDER BY popularity DESC LIMIT 300');
  const maxPop = Math.max(1, ...candidates.map((m) => m.popularity));
  const hasSignals = Object.values(weights).some((w) => w > 0);

  const scored = candidates
    .filter((m) => !seen.has(m.content_id))
    .map((m) => {
      const contributions = (m.genres || []).map((g) => [g, weights[g] || 0]).sort((a, b) => b[1] - a[1]);
      const genreScore = contributions.reduce((sum, [, w]) => sum + w, 0);
      const score = genreScore + m.popularity / maxPop + m.rating_avg * 0.3;
      const reason = hasSignals && contributions[0]?.[1] > 0
        ? `Because you like ${contributions[0][0]}`
        : `Popular in ${region}`;
      return { ...m, _score: Number(score.toFixed(3)), _reason: reason };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  return {
    results: scored,
    personalised: hasSignals,
    signals: Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([genre, weight]) => ({ genre, weight })),
    basedOn: { favouriteGenres: profile?.preferences?.favoriteGenres?.length || 0, watchlist: list.length, history: history.length, reviews: myReviews.length },
    degraded,
  };
}

module.exports = { forUser };
