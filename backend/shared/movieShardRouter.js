const { shardIndex, hashKey } = require('./shardHash');
const { userDb, movieShards, pingPool } = require('./pg');
const { withRetry } = require('./retry');

const NUM_MOVIE_SHARDS = movieShards.length;

function movieShardFor(contentId) {
  const idx = shardIndex(contentId, NUM_MOVIE_SHARDS);
  return { index: idx, ...movieShards[idx] };
}

function movieWriteConn(contentId) {
  return movieShardFor(contentId).primary;
}

function movieReadConn(contentId) {
  const shard = movieShardFor(contentId);
  return shard.replica || shard.primary;
}

function allMovieReadConns() {
  return movieShards.map((s, i) => ({ index: i, region: s.region, conn: s.replica || s.primary }));
}

function movieReadConnsByRegionPriority(preferredRegion) {
  const all = allMovieReadConns();
  if (!preferredRegion) return all;
  const same = all.filter((s) => s.region === preferredRegion);
  const rest = all.filter((s) => s.region !== preferredRegion);
  return [...same, ...rest];
}

const userWriteConn = () => userDb.primary;
const userReadConn = () => userDb.replica || userDb.primary;

/** Query with bounded retry — cushions transient replica blips. */
async function queryWithRetry(pool, text, params) {
  return withRetry(() => pool.query(text, params), { retries: 2, baseMs: 40, label: 'pg_query' });
}

async function healthMovieShards() {
  const checks = await Promise.all(
    movieShards.map(async (s, i) => {
      try {
        await pingPool(s.replica || s.primary);
        return { shard: i, region: s.region, status: 'ok' };
      } catch (err) {
        return { shard: i, region: s.region, status: 'down', error: err.message };
      }
    })
  );
  return checks;
}

async function healthUserDb() {
  try {
    await pingPool(userDb.replica || userDb.primary);
    return { status: 'ok' };
  } catch (err) {
    return { status: 'down', error: err.message };
  }
}

module.exports = {
  NUM_MOVIE_SHARDS,
  hashKey,
  shardIndex,
  movieShardFor,
  movieWriteConn,
  movieReadConn,
  allMovieReadConns,
  movieReadConnsByRegionPriority,
  userWriteConn,
  userReadConn,
  queryWithRetry,
  healthMovieShards,
  healthUserDb,
};
