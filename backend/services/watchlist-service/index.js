require('dotenv').config();
process.env.SERVICE_NAME = 'watchlist-service';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requireAuth } = require('../../shared/auth');
const { watchlistCollection } = require('../../shared/mongoShards');
const { validateWatchlistBody, validatePositiveInt } = require('../../shared/validators');
const { asyncHandler, errorHandler, requestLogger } = require('../../shared/middleware');
const { log } = require('../../shared/logger');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '32kb' }));
app.use(requestLogger('watchlist-service'));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'watchlist-service', store: 'mongodb' }));

app.get('/watchlist', requireAuth, asyncHandler(async (req, res) => {
  const { index, collection } = await watchlistCollection(req.user.sub);
  const rows = await collection.find({ user_id: req.user.sub }).sort({ added_at: -1 }).toArray();
  res.json(rows.map((r) => ({
    user_id: r.user_id,
    content_id: r.content_id,
    added_at: r.added_at,
    shard: index,
    _store: 'mongodb',
  })));
}));

app.post('/watchlist', requireAuth, asyncHandler(async (req, res) => {
  const { contentId } = validateWatchlistBody(req.body);
  const { index, collection } = await watchlistCollection(req.user.sub);
  const doc = {
    user_id: req.user.sub,
    content_id: contentId,
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
}));

app.delete('/watchlist/:contentId', requireAuth, asyncHandler(async (req, res) => {
  const id = validatePositiveInt(req.params.contentId, 'contentId');
  if (!id.ok) return res.status(400).json({ error: id.error });
  const { collection } = await watchlistCollection(req.user.sub);
  await collection.deleteOne({ user_id: req.user.sub, content_id: id.value });
  res.status(204).end();
}));

app.use(errorHandler);

const PORT = process.env.WATCHLIST_SERVICE_PORT || 4003;
app.listen(PORT, () => log.info('listening', { service: 'watchlist-service', port: Number(PORT), store: 'mongodb' }));
