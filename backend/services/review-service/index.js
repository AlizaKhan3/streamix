require('dotenv').config();
process.env.SERVICE_NAME = 'review-service';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const axios = require('axios');
const { requireAuth } = require('../../shared/auth');
const { reviewCollection, allReviewCollections } = require('../../shared/mongoShards');
const { publishReviewEvent, cacheDelPattern } = require('../../shared/redis');
const { movieWriteConn } = require('../../shared/movieShardRouter');
const { validateReviewBody, validatePositiveInt } = require('../../shared/validators');
const { asyncHandler, errorHandler, requireInternal, requestLogger } = require('../../shared/middleware');
const { log } = require('../../shared/logger');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '64kb' }));
app.use(requestLogger('review-service'));

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:4002';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || '';

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'review-service', store: 'mongodb' }));

app.get('/reviews/movie/:movieId', asyncHandler(async (req, res) => {
  const movieId = validatePositiveInt(req.params.movieId, 'movieId');
  if (!movieId.ok) return res.status(400).json({ error: movieId.error });
  const { index, collection } = await reviewCollection(movieId.value);
  const rows = await collection
    .find({ movie_id: movieId.value, moderation_status: 'approved' })
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  res.json(rows.map((r) => ({
    review_id: r._id,
    user_id: r.user_id,
    movie_id: r.movie_id,
    rating: r.rating,
    comment: r.comment,
    moderation_status: r.moderation_status,
    created_at: r.created_at,
    shard: index,
    _store: 'mongodb',
  })));
}));

/** Internal: all reviews by user (for recommendations) — scatter across Mongo shards. */
app.get('/reviews/internal/by-user/:userId', requireInternal, asyncHandler(async (req, res) => {
  const cols = await allReviewCollections();
  const results = await Promise.all(
    cols.map(async ({ index, collection }) => {
      const rows = await collection.find({ user_id: req.params.userId }).project({ movie_id: 1, rating: 1 }).toArray();
      return rows.map((r) => ({ movie_id: r.movie_id, rating: r.rating, shard: index }));
    })
  );
  res.json(results.flat());
}));

app.post('/reviews', requireAuth, asyncHandler(async (req, res) => {
  const { movieId, rating, comment } = validateReviewBody(req.body);

  const { index, collection } = await reviewCollection(movieId);
  const doc = {
    user_id: req.user.sub,
    movie_id: movieId,
    rating,
    comment,
    moderation_status: 'approved',
    created_at: new Date(),
  };
  const result = await collection.insertOne(doc);

  await publishReviewEvent({
    movieId: doc.movie_id,
    userId: doc.user_id,
    rating: doc.rating,
    shardIndex: index,
    at: doc.created_at.toISOString(),
  });
  await cacheDelPattern('catalog:trending:');
  await cacheDelPattern('catalog:search:');

  const agg = await collection.aggregate([
    { $match: { movie_id: movieId, moderation_status: 'approved' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]).toArray();
  if (agg[0]) {
    const avg = Number(agg[0].avg).toFixed(2);
    const count = agg[0].count;
    movieWriteConn(movieId).query(
      `UPDATE movies SET rating_avg = $1, rating_count = $2 WHERE content_id = $3`,
      [avg, count, movieId]
    ).catch((e) => log.warn('aggregate_update_failed', { message: e.message }));
    axios.post(
      `${CATALOG_URL}/catalog/internal/rating`,
      { movieId, avg, count },
      { headers: { 'X-Internal-Secret': INTERNAL_SECRET }, timeout: 3000 }
    ).catch(() => {});
  }

  res.status(201).json({
    review_id: result.insertedId,
    ...doc,
    shard: index,
    _store: 'mongodb',
    _event: 'published to Redis Streams reviews:events',
  });
}));

app.use(errorHandler);

const PORT = process.env.REVIEW_SERVICE_PORT || 4004;
app.listen(PORT, () => log.info('listening', { service: 'review-service', port: Number(PORT), store: 'mongodb' }));
