require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getCacheStats, ensureRedis, REVIEW_STREAM } = require('../../shared/redis');
const { countReviewsPerShard, NUM_REVIEW_SHARDS, NUM_WATCHLIST_SHARDS } = require('../../shared/mongoShards');
const { NUM_MOVIE_SHARDS } = require('../../shared/movieShardRouter');
const {
  getActiveStreamingStats,
  seedActiveSessions,
  startSession,
} = require('../../shared/streamingSessions');
const { requireAuth, requireAdmin } = require('../../shared/auth');
const { asyncHandler, errorHandler, requestLogger } = require('../../shared/middleware');

const app = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger('analytics-service'));

const GROUP = 'analytics-consumers';
const CONSUMER = `analytics-${process.pid}`;

async function ensureConsumerGroup() {
  try {
    const r = await ensureRedis();
    await r.xgroup('CREATE', REVIEW_STREAM, GROUP, '0', 'MKSTREAM');
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) {
      console.warn('[analytics] xgroup', err.message);
    }
  }
}

async function consumeLoop() {
  await ensureConsumerGroup();
  const r = await ensureRedis();
  for (;;) {
    try {
      const res = await r.xreadgroup('GROUP', GROUP, CONSUMER, 'COUNT', 10, 'BLOCK', 5000, 'STREAMS', REVIEW_STREAM, '>');
      if (!res) continue;
      for (const [, messages] of res) {
        for (const [id] of messages) {
          await r.xack(REVIEW_STREAM, GROUP, id);
          await r.incr('stats:analytics:consumed').catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[analytics] consume', err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'analytics-service', store: 'redis+mongodb' }));

app.get('/analytics/summary', asyncHandler(async (_req, res) => {
  const [cacheStats, mongoCounts, streaming] = await Promise.all([
    getCacheStats(),
    countReviewsPerShard().catch(() => ({ 0: 0, 1: 0 })),
    getActiveStreamingStats().catch(() => ({ activeSessions: 0 })),
  ]);
  let streamLen = 0;
  let consumed = 0;
  try {
    const r = await ensureRedis();
    streamLen = await r.xlen(REVIEW_STREAM);
    consumed = Number((await r.get('stats:analytics:consumed')) || 0);
  } catch { /* ignore */ }

  res.json({
    note: 'ClickHouse stand-in (diagram Analytics → ClickHouse): aggregates from Mongo review shards + Redis counters/Streams',
    architectureMap: {
      kafkaStandIn: `Redis Streams ${REVIEW_STREAM}`,
      clickHouseStandIn: 'this service + Redis counters',
      redisRole: 'cache + username lock + event bus + live streaming sessions',
    },
    topology: {
      movieShardsPostgres: NUM_MOVIE_SHARDS,
      watchlistShardsMongo: NUM_WATCHLIST_SHARDS,
      reviewShardsMongo: NUM_REVIEW_SHARDS,
    },
    streaming,
    redis: {
      ...cacheStats,
      reviewStreamLength: streamLen,
      eventsConsumed: consumed,
      stream: REVIEW_STREAM,
    },
    mongoReviewCountsByShard: mongoCounts,
    polyglot: {
      postgres: ['users (P/R vertical split)', 'movies (US/EU horizontal shards)'],
      mongodb: ['watchlist (shard by userId)', 'reviews (shard by movieId)'],
      redis: ['catalog cache', 'email register lock', 'Kafka stand-in (Streams)', '1M active streaming sessions'],
      elasticsearch: ['catalog full-text search'],
    },
  });
}));

/** Live concurrency dashboard — show sir this for "1 million active sessions". */
app.get('/analytics/streaming', asyncHandler(async (_req, res) => {
  res.json(await getActiveStreamingStats());
}));

/** Demo loader: POST { "total": 1000000 } (admin). */
app.post(
  '/analytics/streaming/seed',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const total = Number(req.body?.total ?? 1_000_000);
    const stats = await seedActiveSessions(total);
    res.json({ ok: true, seeded: total, ...stats });
  })
);

/** Optional: one real session start (increments counters). */
app.post('/analytics/streaming/start', requireAuth, asyncHandler(async (req, res) => {
  const contentId = Number(req.body?.contentId);
  const region = req.body?.region === 'EU' ? 'EU' : 'US';
  if (!Number.isFinite(contentId)) {
    return res.status(400).json({ error: 'contentId required' });
  }
  const session = await startSession({
    userId: req.user.sub,
    contentId,
    region,
  });
  res.status(201).json(session);
}));

app.use(errorHandler);

const PORT = process.env.ANALYTICS_SERVICE_PORT || 4006;
app.listen(PORT, () => {
  console.log(`[analytics-service] :${PORT}`);
  consumeLoop().catch((e) => console.error(e));
});
