require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { requireAuth } = require('../../shared/auth');
const { reviewCollection, allReviewCollections } = require('../../shared/mongoShards');
const { publishReviewEvent, cacheDelPattern } = require('../../shared/redis');
const { movieWriteConn } = require('../../shared/movieShardRouter');

const app = express();
app.use(cors());
app.use(express.json());

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:4002';

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'review-service', store: 'mongodb' }));

app.get('/reviews/movie/:movieId', async (req, res) => {
  try {
    const movieId = Number(req.params.movieId);
    const { index, collection } = await reviewCollection(movieId);
    const rows = await collection
      .find({ movie_id: movieId, moderation_status: 'approved' })
      .sort({ created_at: -1 })
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load reviews' });
  }
});

/** Internal: all reviews by user (for recommendations) — scatter across Mongo shards. */
app.get('/reviews/internal/by-user/:userId', async (req, res) => {
  try {
    const cols = await allReviewCollections();
    const results = await Promise.all(
      cols.map(async ({ index, collection }) => {
        const rows = await collection.find({ user_id: req.params.userId }).project({ movie_id: 1, rating: 1 }).toArray();
        return rows.map((r) => ({ movie_id: r.movie_id, rating: r.rating, shard: index }));
      })
    );
    res.json(results.flat());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'scatter failed' });
  }
});

app.post('/reviews', requireAuth, async (req, res) => {
  const { movieId, rating, comment } = req.body;
  if (!movieId || !rating) return res.status(400).json({ error: 'movieId and rating are required' });

  try {
    const { index, collection } = await reviewCollection(movieId);
    const doc = {
      user_id: req.user.sub,
      movie_id: Number(movieId),
      rating: Number(rating),
      comment: comment || null,
      moderation_status: 'approved',
      created_at: new Date(),
    };
    const result = await collection.insertOne(doc);

    // Redis Streams = Kafka stand-in
    await publishReviewEvent({
      movieId: doc.movie_id,
      userId: doc.user_id,
      rating: doc.rating,
      shardIndex: index,
      at: doc.created_at.toISOString(),
    });
    await cacheDelPattern('catalog:trending:');

    // Update movie aggregate on Postgres catalog shard
    const agg = await collection.aggregate([
      { $match: { movie_id: Number(movieId), moderation_status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray();
    if (agg[0]) {
      const avg = Number(agg[0].avg).toFixed(2);
      const count = agg[0].count;
      movieWriteConn(movieId).query(
        `UPDATE movies SET rating_avg = $1, rating_count = $2 WHERE content_id = $3`,
        [avg, count, movieId]
      ).catch((e) => console.error('Aggregate update failed', e.message));
      axios.post(`${CATALOG_URL}/catalog/internal/rating`, { movieId, avg, count }).catch(() => {});
    }

    res.status(201).json({
      review_id: result.insertedId,
      ...doc,
      shard: index,
      _store: 'mongodb',
      _event: 'published to Redis Streams reviews:events',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit review' });
  }
});

const PORT = process.env.REVIEW_SERVICE_PORT || 4004;
app.listen(PORT, () => console.log(`[review-service] :${PORT} (MongoDB shards + Redis Streams)`));
