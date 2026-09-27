// // ============================================================
// // SHARD ROUTER — the single place that turns a logical key (contentId,
// // userId, movieId) into a physical database connection.
// //
// // This module is the concrete implementation of the "Shard Router" box
// // in the architecture diagram: it maintains the shard map, computes
// // shard = hash(key) mod N, and picks primary vs replica depending on
// // whether the caller is reading or writing.
// // ============================================================
// const crypto = require('crypto');
// const { userDb, movieShards, watchlistShards, reviewShards } = require('../config/db');

// const NUM_MOVIE_SHARDS = movieShards.length;
// const NUM_WATCHLIST_SHARDS = watchlistShards.length;
// const NUM_REVIEW_SHARDS = reviewShards.length;

// /** Deterministic hash -> non-negative integer, used for hash-based sharding. */
// function hashKey(key) {
//   const digest = crypto.createHash('md5').update(String(key)).digest('hex');
//   return parseInt(digest.slice(0, 8), 16); // first 4 bytes is plenty of spread
// }

// function shardIndex(key, numShards) {
//   return hashKey(key) % numShards;
// }

// // ---------------- MOVIE ----------------
// function movieShardFor(contentId) {
//   const idx = shardIndex(contentId, NUM_MOVIE_SHARDS);
//   return { index: idx, ...movieShards[idx] };
// }

// /** Write path: always the shard's primary node. */
// function movieWriteConn(contentId) {
//   return movieShardFor(contentId).primary;
// }

// /** Read path: shard's replica when available, falls back to primary. */
// function movieReadConn(contentId) {
//   const shard = movieShardFor(contentId);
//   return shard.replica || shard.primary;
// }

// /** Every movie shard's read (replica) connection, for scatter-gather search. */
// function allMovieReadConns() {
//   return movieShards.map((s, i) => ({ index: i, region: s.region, conn: s.replica || s.primary }));
// }

// // ---------------- WATCHLIST ----------------
// function watchlistShardFor(userId) {
//   const idx = shardIndex(userId, NUM_WATCHLIST_SHARDS);
//   return { index: idx, conn: watchlistShards[idx] };
// }

// // ---------------- REVIEWS ----------------
// function reviewShardFor(movieId) {
//   const idx = shardIndex(movieId, NUM_REVIEW_SHARDS);
//   return { index: idx, conn: reviewShards[idx] };
// }
// function allReviewReadConns() {
//   return reviewShards.map((conn, i) => ({ index: i, conn }));
// }

// // ---------------- USER DB (not sharded, just primary/replica) ----------------
// const userWriteConn = () => userDb.primary;
// const userReadConn = () => userDb.replica || userDb.primary;

// module.exports = {
//   NUM_MOVIE_SHARDS, NUM_WATCHLIST_SHARDS, NUM_REVIEW_SHARDS,
//   hashKey, shardIndex,
//   movieShardFor, movieWriteConn, movieReadConn, allMovieReadConns,
//   watchlistShardFor,
//   reviewShardFor, allReviewReadConns,
//   userWriteConn, userReadConn,
// };
// ============================================================
// SHARD ROUTER — the single place that turns a logical key (contentId,
// userId, movieId) into a physical database connection.
//
// This module is the concrete implementation of the "Shard Router" box
// in the architecture diagram: it maintains the shard map, computes
// shard = hash(key) mod N, and picks primary vs replica depending on
// whether the caller is reading or writing.
// ============================================================
const crypto = require('crypto');
const { userDb, movieShards, watchlistShards, reviewShards } = require('../config/db');

const NUM_MOVIE_SHARDS = movieShards.length;
const NUM_WATCHLIST_SHARDS = watchlistShards.length;
const NUM_REVIEW_SHARDS = reviewShards.length;

/** Deterministic hash -> non-negative integer, used for hash-based sharding. */
function hashKey(key) {
  const digest = crypto.createHash('md5').update(String(key)).digest('hex');
  return parseInt(digest.slice(0, 8), 16); // first 4 bytes is plenty of spread
}

function shardIndex(key, numShards) {
  return hashKey(key) % numShards;
}

// ---------------- MOVIE ----------------
function movieShardFor(contentId) {
  const idx = shardIndex(contentId, NUM_MOVIE_SHARDS);
  return { index: idx, ...movieShards[idx] };
}

/** Write path: always the shard's primary node. */
function movieWriteConn(contentId) {
  return movieShardFor(contentId).primary;
}

/** Read path: shard's replica when available, falls back to primary. */
function movieReadConn(contentId) {
  const shard = movieShardFor(contentId);
  return shard.replica || shard.primary;
}

/** Every movie shard's read (replica) connection, for scatter-gather search. */
function allMovieReadConns() {
  return movieShards.map((s, i) => ({ index: i, region: s.region, conn: s.replica || s.primary }));
}

/**
 * REGION-AWARE ROUTING: put the shard matching the client's region first in
 * the list. Callers that only need "good enough, fast" results (e.g. a home
 * feed) can query just conns[0]; callers that need completeness (e.g. a
 * search) still scatter-gather across the full ordered list, but the
 * same-region shard replies first in practice since it's the nearest node.
 */
function movieReadConnsByRegionPriority(preferredRegion) {
  const all = allMovieReadConns();
  if (!preferredRegion) return all;
  const same = all.filter((s) => s.region === preferredRegion);
  const rest = all.filter((s) => s.region !== preferredRegion);
  return [...same, ...rest];
}

// ---------------- WATCHLIST ----------------
function watchlistShardFor(userId) {
  const idx = shardIndex(userId, NUM_WATCHLIST_SHARDS);
  return { index: idx, conn: watchlistShards[idx] };
}

// ---------------- REVIEWS ----------------
function reviewShardFor(movieId) {
  const idx = shardIndex(movieId, NUM_REVIEW_SHARDS);
  return { index: idx, conn: reviewShards[idx] };
}
function allReviewReadConns() {
  return reviewShards.map((conn, i) => ({ index: i, conn }));
}

// ---------------- USER DB (not sharded, just primary/replica) ----------------
const userWriteConn = () => userDb.primary;
const userReadConn = () => userDb.replica || userDb.primary;

module.exports = {
  NUM_MOVIE_SHARDS, NUM_WATCHLIST_SHARDS, NUM_REVIEW_SHARDS,
  hashKey, shardIndex,
  movieShardFor, movieWriteConn, movieReadConn, allMovieReadConns, movieReadConnsByRegionPriority,
  watchlistShardFor,
  reviewShardFor, allReviewReadConns,
  userWriteConn, userReadConn,
};