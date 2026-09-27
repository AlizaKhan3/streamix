require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('../../shared/auth');
const { allMovieReadConns } = require('../../shared/movieShardRouter');
const { watchlistCollection, allReviewCollections } = require('../../shared/mongoShards');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'recommendation-service' }));

async function getUserWatchlistContentIds(userId) {
  const { collection } = await watchlistCollection(userId);
  const rows = await collection.find({ user_id: userId }).project({ content_id: 1 }).toArray();
  return rows.map((r) => r.content_id);
}

async function getUserReviews(userId) {
  const cols = await allReviewCollections();
  const results = await Promise.all(
    cols.map(({ collection }) =>
      collection.find({ user_id: userId }).project({ movie_id: 1, rating: 1 }).toArray()
    )
  );
  return results.flat().map((r) => ({ movie_id: r.movie_id, rating: r.rating }));
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

app.get('/recommendations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    const [watchlistIds, reviews] = await Promise.all([
      getUserWatchlistContentIds(userId),
      getUserReviews(userId),
    ]);

    const reviewedIds = reviews.map((r) => r.movie_id);
    const knownIds = [...new Set([...watchlistIds, ...reviewedIds])];
    const genresByMovie = await getGenresForContentIds(knownIds);

    const genreScore = {};
    for (const id of watchlistIds) {
      for (const g of genresByMovie.get(id) || []) genreScore[g] = (genreScore[g] || 0) + 1;
    }
    for (const { movie_id, rating } of reviews) {
      const weight = (rating - 3) / 2;
      for (const g of genresByMovie.get(movie_id) || []) genreScore[g] = (genreScore[g] || 0) + weight;
    }

    const topGenres = Object.entries(genreScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);

    if (topGenres.length === 0) {
      const conns = allMovieReadConns();
      const results = await Promise.allSettled(
        conns.map(({ conn }) => conn.query(`SELECT * FROM movies ORDER BY popularity DESC LIMIT 20`))
      );
      const merged = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value.rows);
      return res.json({
        basis: 'trending (cold start — no watchlist/review data yet)',
        results: merged.slice(0, 20),
        _sources: { watchlist: 'mongodb', reviews: 'mongodb', catalog: 'postgres' },
      });
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
    const scored = merged.map((m) => {
      const affinity = (m.genres || []).reduce((sum, g) => sum + (genreScore[g] || 0), 0);
      return { ...m, _score: affinity * (Number(m.popularity) || 1) };
    });
    scored.sort((a, b) => b._score - a._score);

    res.json({
      basis: `weighted on genres: ${topGenres.join(', ')}`,
      results: scored.slice(0, 20),
      _sources: { watchlist: 'mongodb', reviews: 'mongodb', catalog: 'postgres' },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not build recommendations' });
  }
});

const PORT = process.env.RECOMMENDATION_SERVICE_PORT || 4005;
app.listen(PORT, () => console.log(`[recommendation-service] :${PORT}`));
