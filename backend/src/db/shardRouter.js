// Compatibility shim — movie/user routing lives in shared/; Mongo sharding in mongoShards.
const movie = require('../../shared/movieShardRouter');
const mongo = require('../../shared/mongoShards');

module.exports = {
  ...movie,
  NUM_WATCHLIST_SHARDS: mongo.NUM_WATCHLIST_SHARDS,
  NUM_REVIEW_SHARDS: mongo.NUM_REVIEW_SHARDS,
  watchlistShardFor: mongo.watchlistShardFor,
  reviewShardFor: mongo.reviewShardFor,
  allReviewReadConns: () => [], // legacy PG API removed; use mongoShards.allReviewCollections
};
