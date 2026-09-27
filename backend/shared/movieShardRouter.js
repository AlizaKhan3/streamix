const { shardIndex, hashKey } = require('./shardHash');
const { userDb, movieShards } = require('./pg');

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
};
