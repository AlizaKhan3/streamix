// Deterministic hash → shard index (same algorithm used across all services).
const crypto = require('crypto');

function hashKey(key) {
  const digest = crypto.createHash('md5').update(String(key)).digest('hex');
  return parseInt(digest.slice(0, 8), 16);
}

function shardIndex(key, numShards) {
  return hashKey(key) % numShards;
}

module.exports = { hashKey, shardIndex };
