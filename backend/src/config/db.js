// ============================================================
// Declares a `Pool` (node-postgres connection pool) for every physical
// node in the cluster, and groups them the way the architecture doc
// describes: one primary/replica pair for users, N region-tagged
// primary/replica pairs for movie shards, and N single-node shards
// for watchlist / reviews.
//
// Nothing else in the codebase should open a `pg` connection directly —
// always go through this module (or shardRouter.js) so that node
// topology stays in exactly one place (DISTRIBUTION TRANSPARENCY).
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');

function pool(host, port, database, user, password) {
  return new Pool({ host, port: Number(port), database, user, password, max: 10 });
}

// ---------------- USER DB (primary/replica) ----------------
const userDb = {
  primary: pool(
    process.env.USER_DB_MASTER_HOST, process.env.USER_DB_MASTER_PORT,
    process.env.USER_DB_NAME, process.env.USER_DB_USER, process.env.USER_DB_PASSWORD
  ),
  replica: pool(
    process.env.USER_DB_REPLICA_HOST, process.env.USER_DB_REPLICA_PORT,
    process.env.USER_DB_NAME, process.env.USER_DB_USER, process.env.USER_DB_PASSWORD
  ),
};

// ---------------- MOVIE SHARDS (region-aware, replicated) ----------------
// Add a 3rd/4th shard later just by appending another block here + bumping
// NUM_MOVIE_SHARDS in shardRouter.js — nothing else needs to change.
const movieShards = [
  {
    region: process.env.MOVIE_SHARD0_REGION || 'US',
    primary: pool(process.env.MOVIE_SHARD0_MASTER_HOST, process.env.MOVIE_SHARD0_MASTER_PORT,
      process.env.MOVIE_DB_NAME, process.env.MOVIE_DB_USER, process.env.MOVIE_DB_PASSWORD),
    replica: pool(process.env.MOVIE_SHARD0_REPLICA_HOST, process.env.MOVIE_SHARD0_REPLICA_PORT,
      process.env.MOVIE_DB_NAME, process.env.MOVIE_DB_USER, process.env.MOVIE_DB_PASSWORD),
  },
  {
    region: process.env.MOVIE_SHARD1_REGION || 'EU',
    primary: pool(process.env.MOVIE_SHARD1_MASTER_HOST, process.env.MOVIE_SHARD1_MASTER_PORT,
      process.env.MOVIE_DB_NAME, process.env.MOVIE_DB_USER, process.env.MOVIE_DB_PASSWORD),
    replica: pool(process.env.MOVIE_SHARD1_REPLICA_HOST, process.env.MOVIE_SHARD1_REPLICA_PORT,
      process.env.MOVIE_DB_NAME, process.env.MOVIE_DB_USER, process.env.MOVIE_DB_PASSWORD),
  },
];

// ---------------- WATCHLIST SHARDS (single node each) ----------------
const watchlistShards = [
  pool(process.env.WATCHLIST_SHARD0_HOST, process.env.WATCHLIST_SHARD0_PORT,
    process.env.WATCHLIST_DB_NAME, process.env.WATCHLIST_DB_USER, process.env.WATCHLIST_DB_PASSWORD),
  pool(process.env.WATCHLIST_SHARD1_HOST, process.env.WATCHLIST_SHARD1_PORT,
    process.env.WATCHLIST_DB_NAME, process.env.WATCHLIST_DB_USER, process.env.WATCHLIST_DB_PASSWORD),
];

// ---------------- REVIEW SHARDS (single node each) ----------------
const reviewShards = [
  pool(process.env.REVIEW_SHARD0_HOST, process.env.REVIEW_SHARD0_PORT,
    process.env.REVIEW_DB_NAME, process.env.REVIEW_DB_USER, process.env.REVIEW_DB_PASSWORD),
  pool(process.env.REVIEW_SHARD1_HOST, process.env.REVIEW_SHARD1_PORT,
    process.env.REVIEW_DB_NAME, process.env.REVIEW_DB_USER, process.env.REVIEW_DB_PASSWORD),
];

module.exports = { userDb, movieShards, watchlistShards, reviewShards };
