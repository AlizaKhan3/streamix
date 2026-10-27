/**
 * Hot-path "active streaming sessions" counters in Redis
 * (Analytics / ClickHouse stand-in for live concurrency).
 *
 * Real product: each play() INCR + heartbeat; leave/timeout DECR.
 * Viva scale demo: seedActiveSessions(1_000_000) sets counters instantly.
 */
const { ensureRedis } = require('./redis');
const { shardIndex } = require('./shardHash');
const { NUM_MOVIE_SHARDS } = require('./movieShardRouter');

const KEY_TOTAL = 'streaming:active:count';
const KEY_REGIONS = 'streaming:active:regions';
const KEY_SHARDS = 'streaming:active:movie_shards';
const KEY_UPDATED = 'streaming:active:updated_at';
const KEY_SAMPLE = 'streaming:active:sample'; // list of recent session ids (capped)

async function getActiveStreamingStats() {
  const r = await ensureRedis();
  const [total, regions, shards, updated, sample] = await Promise.all([
    r.get(KEY_TOTAL),
    r.hgetall(KEY_REGIONS),
    r.hgetall(KEY_SHARDS),
    r.get(KEY_UPDATED),
    r.lrange(KEY_SAMPLE, 0, 19),
  ]);
  const byRegion = {};
  for (const [k, v] of Object.entries(regions || {})) byRegion[k] = Number(v) || 0;
  const byMovieShard = {};
  for (const [k, v] of Object.entries(shards || {})) byMovieShard[k] = Number(v) || 0;

  return {
    activeSessions: Number(total) || 0,
    byRegion,
    byMovieShard,
    updatedAt: updated || null,
    sampleSessions: (sample || []).map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    }),
    store: 'redis',
    note: 'Live concurrency counters (ClickHouse would hold historical session fact table)',
  };
}

/**
 * Set absolute active-session totals for demo (not incremental heartbeats).
 * Splits across US/EU and movie shards for a realistic dashboard.
 */
async function seedActiveSessions(total = 1_000_000) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const us = Math.floor(n * 0.52);
  const eu = n - us;

  const shardCounts = Array.from({ length: NUM_MOVIE_SHARDS }, () => 0);
  // Deterministic split by hashing synthetic session ids (same router as catalog)
  for (let i = 0; i < NUM_MOVIE_SHARDS; i++) {
    shardCounts[i] = Math.floor(n / NUM_MOVIE_SHARDS);
  }
  shardCounts[0] += n - shardCounts.reduce((a, b) => a + b, 0);

  const r = await ensureRedis();
  const pipe = r.pipeline();
  pipe.set(KEY_TOTAL, String(n));
  pipe.del(KEY_REGIONS);
  pipe.hset(KEY_REGIONS, 'US', String(us), 'EU', String(eu));
  pipe.del(KEY_SHARDS);
  for (let i = 0; i < shardCounts.length; i++) {
    pipe.hset(KEY_SHARDS, String(i), String(shardCounts[i]));
  }
  pipe.set(KEY_UPDATED, new Date().toISOString());
  pipe.del(KEY_SAMPLE);

  // Keep a small inspectable sample (not 1M keys — counters are the scale proof)
  const sampleN = Math.min(20, n);
  for (let i = 0; i < sampleN; i++) {
    const sessionId = `sess_${Date.now()}_${i}`;
    const contentId = 50_000_000 + (i * 9973);
    const region = i % 2 === 0 ? 'US' : 'EU';
    const movieShard = shardIndex(contentId, NUM_MOVIE_SHARDS);
    pipe.rpush(
      KEY_SAMPLE,
      JSON.stringify({
        sessionId,
        contentId,
        region,
        movieShard,
        bitrateKbps: 2500 + (i % 5) * 500,
        startedAt: new Date(Date.now() - i * 60_000).toISOString(),
      })
    );
  }
  await pipe.exec();

  return getActiveStreamingStats();
}

/** Simulate one viewer starting playback. */
async function startSession({ userId, contentId, region = 'US' }) {
  const r = await ensureRedis();
  const movieShard = shardIndex(contentId, NUM_MOVIE_SHARDS);
  const sessionId = `sess_${userId || 'anon'}_${contentId}_${Date.now()}`;
  const pipe = r.pipeline();
  pipe.incr(KEY_TOTAL);
  pipe.hincrby(KEY_REGIONS, region, 1);
  pipe.hincrby(KEY_SHARDS, String(movieShard), 1);
  pipe.set(KEY_UPDATED, new Date().toISOString());
  pipe.lpush(
    KEY_SAMPLE,
    JSON.stringify({ sessionId, contentId, region, movieShard, startedAt: new Date().toISOString() })
  );
  pipe.ltrim(KEY_SAMPLE, 0, 19);
  await pipe.exec();
  return { sessionId, contentId, region, movieShard };
}

module.exports = {
  getActiveStreamingStats,
  seedActiveSessions,
  startSession,
  KEY_TOTAL,
};
