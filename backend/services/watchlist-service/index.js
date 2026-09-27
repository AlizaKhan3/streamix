require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('../../shared/auth');
const { watchlistCollection } = require('../../shared/mongoShards');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'watchlist-service', store: 'mongodb' }));

app.get('/watchlist', requireAuth, async (req, res) => {
  try {
    const { index, collection } = await watchlistCollection(req.user.sub);
    const rows = await collection.find({ user_id: req.user.sub }).sort({ added_at: -1 }).toArray();
    res.json(rows.map((r) => ({
      user_id: r.user_id,
      content_id: r.content_id,
      added_at: r.added_at,
      shard: index,
      _store: 'mongodb',
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load watchlist' });
  }
});

app.post('/watchlist', requireAuth, async (req, res) => {
  const { contentId } = req.body;
  if (!contentId) return res.status(400).json({ error: 'contentId required' });
  try {
    const { index, collection } = await watchlistCollection(req.user.sub);
    const doc = {
      user_id: req.user.sub,
      content_id: Number(contentId),
      added_at: new Date(),
    };
    try {
      await collection.insertOne(doc);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(201).json({ ...doc, shard: index, _store: 'mongodb', duplicate: true });
      }
      throw err;
    }
    res.status(201).json({ ...doc, shard: index, _store: 'mongodb' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add to watchlist' });
  }
});

app.delete('/watchlist/:contentId', requireAuth, async (req, res) => {
  try {
    const { collection } = await watchlistCollection(req.user.sub);
    await collection.deleteOne({ user_id: req.user.sub, content_id: Number(req.params.contentId) });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not remove from watchlist' });
  }
});

const PORT = process.env.WATCHLIST_SERVICE_PORT || 4003;
app.listen(PORT, () => console.log(`[watchlist-service] :${PORT} (MongoDB shards)`));
