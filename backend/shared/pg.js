// Postgres pools for User DB + Movie shards (primary/replica).
require('dotenv').config();
const { Pool } = require('pg');

function pool(host, port, database, user, password) {
  return new Pool({
    host,
    port: Number(port),
    database,
    user,
    password,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 10_000),
  });
}

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

async function pingPool(p) {
  const client = await p.connect();
  try {
    await client.query('SELECT 1');
    return { status: 'ok' };
  } finally {
    client.release();
  }
}

module.exports = { userDb, movieShards, pingPool };
