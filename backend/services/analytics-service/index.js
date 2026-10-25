require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getCacheStats, ensureRedis, REVIEW_STREAM } = require('../../shared/redis');
const { countReviewsPerShard, NUM_REVIEW_SHARDS, NUM_WATCHLIST_SHARDS } = require('../../shared/mongoShards');
const { NUM_MOVIE_SHARDS } = require('../../shared/movieShardRouter');

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/analytics/summary', async (_req, res) => {
  try {
    const [cacheStats, mongoCounts] = await Promise.all([
      getCacheStats(),
      countReviewsPerShard().catch(() => ({ 0: 0, 1: 0 })),
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
        redisRole: 'cache + username lock + event bus',
      },
      topology: {
        movieShardsPostgres: NUM_MOVIE_SHARDS,
        watchlistShardsMongo: NUM_WATCHLIST_SHARDS,
        reviewShardsMongo: NUM_REVIEW_SHARDS,
      },
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
        redis: ['catalog cache', 'email register lock', 'Kafka stand-in (Streams)'],
        elasticsearch: ['catalog full-text search'],
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'analytics failed' });
  }
});

const PORT = process.env.ANALYTICS_SERVICE_PORT || 4006;
app.listen(PORT, () => {
  console.log(`[analytics-service] :${PORT}`);
  consumeLoop().catch((e) => console.error(e));
});
