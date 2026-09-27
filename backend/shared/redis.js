// Redis: catalog cache + Streams event bus (Kafka stand-in for local demo).
const Redis = require('ioredis');

let client;

function getRedis() {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    client = new Redis(url, { maxRetriesPerRequest: 2 });
    client.on('error', (err) => console.warn('[redis]', err.message));
  }
  return client;
}

async function ensureRedis() {
  return getRedis();
}

async function cacheGet(key) {
  try {
    const r = await ensureRedis();
    const val = await r.get(key);
    if (val) {
      console.log(`[cache] HIT ${key}`);
      await r.incr('stats:cache:hits').catch(() => {});
      return JSON.parse(val);
    }
    console.log(`[cache] MISS ${key}`);
    await r.incr('stats:cache:misses').catch(() => {});
    return null;
  } catch (err) {
    console.warn('[cache] get failed', err.message);
    return null;
  }
}

async function cacheSet(key, value, ttlSec = 60) {
  try {
    const r = await ensureRedis();
    await r.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch (err) {
    console.warn('[cache] set failed', err.message);
  }
}

async function cacheDelPattern(prefix) {
  try {
    const r = await ensureRedis();
    const keys = await r.keys(`${prefix}*`);
    if (keys.length) await r.del(...keys);
  } catch (err) {
    console.warn('[cache] del failed', err.message);
  }
}

const REVIEW_STREAM = 'reviews:events';

async function publishReviewEvent(payload) {
  try {
    const r = await ensureRedis();
    const flat = {};
    for (const [k, v] of Object.entries(payload)) flat[k] = String(v);
    await r.xadd(REVIEW_STREAM, '*', ...Object.entries(flat).flat());
    await r.incr('stats:reviews:published').catch(() => {});
    if (payload.shardIndex != null) {
      await r.incr(`stats:reviews:shard:${payload.shardIndex}`).catch(() => {});
    }
  } catch (err) {
    console.warn('[stream] publish failed', err.message);
  }
}

async function getCacheStats() {
  try {
    const r = await ensureRedis();
    const [hits, misses, published, s0, s1] = await Promise.all([
      r.get('stats:cache:hits'),
      r.get('stats:cache:misses'),
      r.get('stats:reviews:published'),
      r.get('stats:reviews:shard:0'),
      r.get('stats:reviews:shard:1'),
    ]);
    return {
      cacheHits: Number(hits || 0),
      cacheMisses: Number(misses || 0),
      reviewsPublished: Number(published || 0),
      reviewsByShard: { 0: Number(s0 || 0), 1: Number(s1 || 0) },
    };
  } catch {
    return { cacheHits: 0, cacheMisses: 0, reviewsPublished: 0, reviewsByShard: { 0: 0, 1: 0 } };
  }
}

module.exports = {
  getRedis,
  ensureRedis,
  cacheGet,
  cacheSet,
  cacheDelPattern,
  publishReviewEvent,
  getCacheStats,
  REVIEW_STREAM,
};
