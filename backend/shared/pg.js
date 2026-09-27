// Postgres pools for User DB + Movie shards (primary/replica).
require('dotenv').config();
const { Pool } = require('pg');

function pool(host, port, database, user, password) {
  return new Pool({ host, port: Number(port), database, user, password, max: 10 });
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

module.exports = { userDb, movieShards };
