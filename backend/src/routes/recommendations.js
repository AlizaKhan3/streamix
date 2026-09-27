// ============================================================
// RECOMMENDATIONS — a simple, explainable content-based recommender.
//
// 1. Pull the signed-in user's watchlist (their own shard) + every review
//    they've written (scattered across review shards — small per-user
//    fan-out, fine at this scale).
// 2. Look up those movies' genres from the movie cluster (scatter-gather,
//    same pattern as /catalog/search).
// 3. Weight each genre by how often it shows up, weighted extra by the
//    star rating the user gave (a 5-star review counts more than a
//    1-star one, watchlist adds get a flat weight).
// 4. Scatter-gather the movie cluster again for the top-weighted genres,
//    excluding anything already in the user's watchlist, merge + sort
//    by (genre affinity score * popularity).
//
// This is intentionally simple (no collaborative filtering / ML model —
// that's future work, see README "What's next"), but it is a real,
// personalized ranking driven by the user's own distributed data, not a
// static genre list.
// ============================================================
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const {
  watchlistShardFor, allReviewReadConns, allMovieReadConns,
} = require('../db/shardRouter');

async function getUserWatchlistContentIds(userId) {
  const { conn } = watchlistShardFor(userId);
  const { rows } = await conn.query(`SELECT content_id FROM watchlist WHERE user_id = $1`, [userId]);
  return rows.map((r) => r.content_id);
}

async function getUserReviews(userId) {
  const conns = allReviewReadConns();
  const results = await Promise.allSettled(
    conns.map(({ conn }) => conn.query(`SELECT movie_id, rating FROM reviews WHERE user_id = $1`, [userId]))
  );
  return results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value.rows);
}

async function getGenresForContentIds(contentIds) {
  if (!contentIds.length) return new Map();
  const conns = allMovieReadConns();
  const results = await Promise.allSettled(
    conns.map(({ conn }) =>
      conn.query(`SELECT content_id, genres FROM movies WHERE content_id = ANY($1)`, [contentIds])
    )
  );
  const map = new Map();
  results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value.rows)
    .forEach((row) => map.set(row.content_id, row.genres || []));
  return map;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const [watchlistIds, reviews] = await Promise.all([
      getUserWatchlistContentIds(userId),
      getUserReviews(userId),
    ]);

    const reviewedIds = reviews.map((r) => r.movie_id);
    const knownIds = [...new Set([...watchlistIds, ...reviewedIds])];
    const genresByMovie = await getGenresForContentIds(knownIds);

    // ---- build a genre affinity score ----
    const genreScore = {};
    for (const id of watchlistIds) {
      for (const g of genresByMovie.get(id) || []) genreScore[g] = (genreScore[g] || 0) + 1;
    }
    for (const { movie_id, rating } of reviews) {
      const weight = (rating - 3) / 2; // 1★ = -1, 3★ = 0, 5★ = +1
      for (const g of genresByMovie.get(movie_id) || []) genreScore[g] = (genreScore[g] || 0) + weight;
    }

    const topGenres = Object.entries(genreScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);

    if (topGenres.length === 0) {
      // Cold start — no signal yet, fall back to trending.
      const conns = allMovieReadConns();
      const results = await Promise.allSettled(
        conns.map(({ conn }) => conn.query(`SELECT * FROM movies ORDER BY popularity DESC LIMIT 20`))
      );
      const merged = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value.rows);
      return res.json({ basis: 'trending (cold start — no watchlist/review data yet)', results: merged.slice(0, 20) });
    }

    const excludeIds = watchlistIds.length ? watchlistIds : [0];
    const conns = allMovieReadConns();
    const results = await Promise.allSettled(
      conns.map(({ conn, region }) =>
        conn.query(
          `SELECT * FROM movies WHERE genres && $1 AND NOT (content_id = ANY($2))
           ORDER BY popularity DESC LIMIT 20`,
          [topGenres, excludeIds]
        ).then((r) => r.rows.map((row) => ({ ...row, _region: region })))
      )
    );
    const merged = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);

    // Score = sum of affinity for each matching genre * popularity, so a movie
    // matching two of your top genres ranks above one matching only one.
    const scored = merged.map((m) => {
      const affinity = (m.genres || []).reduce((sum, g) => sum + (genreScore[g] || 0), 0);
      return { ...m, _score: affinity * (Number(m.popularity) || 1) };
    });
    scored.sort((a, b) => b._score - a._score);

    res.json({ basis: `weighted on genres: ${topGenres.join(', ')}`, results: scored.slice(0, 20) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not build recommendations' });
  }
});

module.exports = router;
