const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { reviewShardFor } = require('../db/shardRouter');
const { movieWriteConn } = require('../db/shardRouter');

/** GET /reviews/movie/:movieId — single-shard read (movieId is the shard key). */
router.get('/movie/:movieId', async (req, res) => {
  const { conn } = reviewShardFor(req.params.movieId);
  const { rows } = await conn.query(
    `SELECT * FROM reviews WHERE movie_id = $1 AND moderation_status = 'approved' ORDER BY created_at DESC`,
    [req.params.movieId]
  );
  res.json(rows);
});

/** POST /reviews — writes the review shard, then asynchronously updates the movie's aggregate. */
router.post('/', requireAuth, async (req, res) => {
  const { movieId, rating, comment } = req.body;
  if (!movieId || !rating) return res.status(400).json({ error: 'movieId and rating are required' });

  const { conn } = reviewShardFor(movieId);
  try {
    const { rows } = await conn.query(
      `INSERT INTO reviews (user_id, movie_id, rating, comment) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.sub, movieId, rating, comment || null]
    );

    // Update the movie's rating_avg/rating_count on its own shard — "async" here just
    // means it does not block the response; in the full system this would be an
    // event on a message queue (Kafka/RabbitMQ) as noted in the architecture doc.
    reviewShardFor(movieId).conn.query(
      `SELECT AVG(rating)::numeric(3,2) AS avg, COUNT(*) AS count FROM reviews WHERE movie_id = $1 AND moderation_status = 'approved'`,
      [movieId]
    ).then(({ rows: agg }) => {
      return movieWriteConn(movieId).query(
        `UPDATE movies SET rating_avg = $1, rating_count = $2 WHERE content_id = $3`,
        [agg[0].avg, agg[0].count, movieId]
      );
    }).catch((e) => console.error('Aggregate update failed', e));

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit review' });
  }
});

module.exports = router;
