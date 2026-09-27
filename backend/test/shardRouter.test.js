// Run with: node --test test/
// (No DB connection needed — pg.Pool doesn't connect until a query runs,
// so these tests only exercise the pure routing/hashing logic.)
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.example') });

const {
  hashKey, shardIndex, movieShardFor, watchlistShardFor, reviewShardFor,
  NUM_MOVIE_SHARDS, NUM_WATCHLIST_SHARDS, NUM_REVIEW_SHARDS,
  allMovieReadConns, movieReadConnsByRegionPriority,
} = require('../src/db/shardRouter');

test('hashKey is deterministic for the same key', () => {
  assert.equal(hashKey('abc123'), hashKey('abc123'));
});

test('hashKey differs for different keys (no trivial collisions on simple inputs)', () => {
  assert.notEqual(hashKey('movie-1'), hashKey('movie-2'));
});

test('shardIndex always falls within [0, numShards)', () => {
  for (let i = 0; i < 500; i++) {
    const idx = shardIndex(`content-${i}`, NUM_MOVIE_SHARDS);
    assert.ok(idx >= 0 && idx < NUM_MOVIE_SHARDS);
  }
});

test('movieShardFor is stable: same contentId always routes to the same shard', () => {
  const first = movieShardFor(42).index;
  for (let i = 0; i < 20; i++) {
    assert.equal(movieShardFor(42).index, first);
  }
});

test('movieShardFor distributes a spread of ids across all shards (no shard starved)', () => {
  const seen = new Set();
  for (let id = 0; id < 200; id++) seen.add(movieShardFor(id).index);
  assert.equal(seen.size, NUM_MOVIE_SHARDS, 'expected every shard to receive at least one id out of 200 samples');
});

test('watchlistShardFor and reviewShardFor are stable per key', () => {
  const userId = 'user-abc-123';
  const first = watchlistShardFor(userId).index;
  assert.equal(watchlistShardFor(userId).index, first);

  const movieId = 999;
  const firstReview = reviewShardFor(movieId).index;
  assert.equal(reviewShardFor(movieId).index, firstReview);
});

test('watchlist/review shard indices stay within configured shard counts', () => {
  assert.ok(watchlistShardFor('x').index < NUM_WATCHLIST_SHARDS);
  assert.ok(reviewShardFor(1).index < NUM_REVIEW_SHARDS);
});

test('allMovieReadConns returns one entry per configured movie shard, each tagged with a region', () => {
  const conns = allMovieReadConns();
  assert.equal(conns.length, NUM_MOVIE_SHARDS);
  for (const c of conns) {
    assert.ok(c.region, 'every shard entry should carry a region label');
    assert.ok(c.conn, 'every shard entry should carry a connection pool');
  }
});

test('movieReadConnsByRegionPriority puts the matching region shard(s) first', () => {
  const ordered = movieReadConnsByRegionPriority('EU');
  const euIndex = ordered.findIndex((c) => c.region === 'EU');
  const nonEuIndex = ordered.findIndex((c) => c.region !== 'EU');
  if (nonEuIndex !== -1) {
    assert.ok(euIndex < nonEuIndex, 'EU shard(s) should be ordered before non-EU shards');
  }
});

test('movieReadConnsByRegionPriority falls back to unordered list when region is falsy', () => {
  const ordered = movieReadConnsByRegionPriority(undefined);
  assert.equal(ordered.length, NUM_MOVIE_SHARDS);
});
