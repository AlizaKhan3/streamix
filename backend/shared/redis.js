// Redis: catalog cache + Streams event bus (Kafka stand-in for local demo).
const Redis = require('ioredis');
const { log } = require('./logger');

let client;

function getRedis() {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    client.on('error', (err) => log.warn('redis_error', { message: err.message }));
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
      log.debug('cache_hit', { key });
      await r.incr('stats:cache:hits').catch(() => {});
      return JSON.parse(val);
    }
    log.debug('cache_miss', { key });
    await r.incr('stats:cache:misses').catch(() => {});
    return null;
  } catch (err) {
    log.warn('cache_get_failed', { message: err.message });
    return null;
  }
}

async function cacheSet(key, value, ttlSec = 60) {
  try {
    const r = await ensureRedis();
    await r.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch (err) {
    log.warn('cache_set_failed', { message: err.message });
  }
}

/** Production-safe delete by prefix (SCAN, never KEYS). */
async function cacheDelPattern(prefix) {
  try {
    const r = await ensureRedis();
    const match = `${prefix}*`;
    let cursor = '0';
    do {
      const [next, keys] = await r.scan(cursor, 'MATCH', match, 'COUNT', 100);
      cursor = next;
      if (keys.length) await r.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    log.warn('cache_del_failed', { message: err.message });
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
    log.warn('stream_publish_failed', { message: err.message });
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

async function pingRedis() {
  try {
    const r = await ensureRedis();
    const pong = await r.ping();
    return { status: pong === 'PONG' ? 'ok' : 'down' };
  } catch (err) {
    return { status: 'down', error: err.message };
  }
}

/**
 * Distributed lock for registration (diagram: "Redis — Cache + username lock").
 * SET key NX EX — only one concurrent register for the same email can proceed.
 */
async function acquireEmailLock(email, ttlSec = 15) {
  try {
    const r = await ensureRedis();
    const key = `lock:register:email:${String(email).toLowerCase()}`;
    const ok = await r.set(key, String(Date.now()), 'EX', ttlSec, 'NX');
    return { acquired: ok === 'OK', key };
  } catch (err) {
    log.warn('email_lock_failed', { message: err.message });
    // Fail open if Redis is down — Postgres UNIQUE still protects integrity
    return { acquired: true, key: null, degraded: true };
  }
}

async function releaseEmailLock(key) {
  if (!key) return;
  try {
    await ensureRedis().del(key);
  } catch (_) { /* ignore */ }
}

module.exports = {
  getRedis,
  ensureRedis,
  cacheGet,
  cacheSet,
  cacheDelPattern,
  publishReviewEvent,
  getCacheStats,
  pingRedis,
  acquireEmailLock,
  releaseEmailLock,
  REVIEW_STREAM,
};
