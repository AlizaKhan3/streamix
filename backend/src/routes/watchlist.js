const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { watchlistShardFor } = require('../db/shardRouter');

router.use(requireAuth);

// All three routes below hit exactly ONE shard: the user's own shard,
// found by hash(userId) mod NUM_WATCHLIST_SHARDS.

router.get('/', async (req, res) => {
  const { conn } = watchlistShardFor(req.user.sub);
  const { rows } = await conn.query(
    `SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC`, [req.user.sub]
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { contentId } = req.body;
  const { conn, index } = watchlistShardFor(req.user.sub);
  try {
    const { rows } = await conn.query(
      `INSERT INTO watchlist (user_id, content_id) VALUES ($1, $2)
       ON CONFLICT (user_id, content_id) DO NOTHING RETURNING *`,
      [req.user.sub, contentId]
    );
    res.status(201).json({ ...rows[0], shard: index });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add to watchlist' });
  }
});

router.delete('/:contentId', async (req, res) => {
  const { conn } = watchlistShardFor(req.user.sub);
  await conn.query(`DELETE FROM watchlist WHERE user_id = $1 AND content_id = $2`,
    [req.user.sub, req.params.contentId]);
  res.status(204).end();
});

module.exports = router;
