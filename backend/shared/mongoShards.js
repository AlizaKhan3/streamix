// Application-level Mongo sharding (2 nodes each for watchlist + reviews).
const { MongoClient } = require('mongodb');
const { shardIndex } = require('./shardHash');

const NUM_WATCHLIST_SHARDS = 2;
const NUM_REVIEW_SHARDS = 2;

const watchlistUris = [
  process.env.WATCHLIST_MONGO0_URI || 'mongodb://localhost:27017/watchlist',
  process.env.WATCHLIST_MONGO1_URI || 'mongodb://localhost:27018/watchlist',
];
const reviewUris = [
  process.env.REVIEW_MONGO0_URI || 'mongodb://localhost:27019/reviews',
  process.env.REVIEW_MONGO1_URI || 'mongodb://localhost:27020/reviews',
];

const watchlistClients = [];
const reviewClients = [];

async function getClient(uri, cache, idx) {
  if (!cache[idx]) {
    const client = new MongoClient(uri);
    await client.connect();
    cache[idx] = client;
  }
  return cache[idx];
}

async function watchlistCollection(userId) {
  const idx = shardIndex(userId, NUM_WATCHLIST_SHARDS);
  const client = await getClient(watchlistUris[idx], watchlistClients, idx);
  const col = client.db().collection('items');
  await col.createIndex({ user_id: 1, content_id: 1 }, { unique: true }).catch(() => {});
  return { index: idx, collection: col };
}

function watchlistShardFor(userId) {
  return { index: shardIndex(userId, NUM_WATCHLIST_SHARDS) };
}

async function reviewCollection(movieId) {
  const idx = shardIndex(movieId, NUM_REVIEW_SHARDS);
  const client = await getClient(reviewUris[idx], reviewClients, idx);
  const col = client.db().collection('reviews');
  await col.createIndex({ movie_id: 1, created_at: -1 }).catch(() => {});
  await col.createIndex({ user_id: 1 }).catch(() => {});
  return { index: idx, collection: col };
}

function reviewShardFor(movieId) {
  return { index: shardIndex(movieId, NUM_REVIEW_SHARDS) };
}

async function allReviewCollections() {
  const out = [];
  for (let i = 0; i < NUM_REVIEW_SHARDS; i++) {
    const client = await getClient(reviewUris[i], reviewClients, i);
    out.push({ index: i, collection: client.db().collection('reviews') });
  }
  return out;
}

async function allWatchlistCollections() {
  const out = [];
  for (let i = 0; i < NUM_WATCHLIST_SHARDS; i++) {
    const client = await getClient(watchlistUris[i], watchlistClients, i);
    out.push({ index: i, collection: client.db().collection('items') });
  }
  return out;
}

async function countReviewsPerShard() {
  const cols = await allReviewCollections();
  const counts = {};
  for (const { index, collection } of cols) {
    counts[index] = await collection.countDocuments();
  }
  return counts;
}

module.exports = {
  NUM_WATCHLIST_SHARDS,
  NUM_REVIEW_SHARDS,
  watchlistCollection,
  watchlistShardFor,
  reviewCollection,
  reviewShardFor,
  allReviewCollections,
  allWatchlistCollections,
  countReviewsPerShard,
};
