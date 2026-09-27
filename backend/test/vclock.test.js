const test = require('node:test');
const assert = require('node:assert/strict');
const vclock = require('../src/services/vclock');

test('compare detects happened-before in both directions', () => {
  assert.equal(vclock.compare({ PK: 1 }, { PK: 2 }), 'before');
  assert.equal(vclock.compare({ PK: 2, US: 1 }, { PK: 1, US: 1 }), 'after');
  assert.equal(vclock.compare({ PK: 1, US: 1 }, { US: 1, PK: 1 }), 'equal');
  assert.equal(vclock.compare({}, {}), 'equal');
});

test('compare detects concurrent edits made in two regions', () => {
  assert.equal(vclock.compare({ PK: 2, US: 1 }, { PK: 1, US: 2 }), 'concurrent');
});

test('missing entries count as zero', () => {
  assert.equal(vclock.compare({ PK: 1 }, { PK: 1, US: 1 }), 'before');
});

test('merge takes the element-wise max and dominates both inputs', () => {
  const a = { PK: 2, US: 1 };
  const b = { PK: 1, US: 3 };
  const m = vclock.merge(a, b);
  assert.deepEqual(m, { PK: 2, US: 3 });
  assert.equal(vclock.compare(m, a), 'after');
  assert.equal(vclock.compare(m, b), 'after');
});

test('increment only bumps the writing region', () => {
  assert.deepEqual(vclock.increment({ PK: 1 }, 'US'), { PK: 1, US: 1 });
  assert.deepEqual(vclock.increment({ PK: 1 }, 'PK'), { PK: 2 });
});

test('last-write-wins is deterministic from either side', () => {
  const pk = { updated_at: '2026-01-01T10:00:00Z', last_writer_region: 'PK' };
  const us = { updated_at: '2026-01-01T10:00:05Z', last_writer_region: 'US' };
  assert.equal(vclock.lastWriteWins(pk, us), 'remote');
  assert.equal(vclock.lastWriteWins(us, pk), 'local');

  const tieA = { updated_at: '2026-01-01T10:00:00Z', last_writer_region: 'PK' };
  const tieB = { updated_at: '2026-01-01T10:00:00Z', last_writer_region: 'US' };
  assert.equal(vclock.lastWriteWins(tieA, tieB), 'remote');
  assert.equal(vclock.lastWriteWins(tieB, tieA), 'local');
});

test('accepts clocks serialised as JSON strings', () => {
  assert.equal(vclock.compare('{"PK":1}', { PK: 2 }), 'before');
});
