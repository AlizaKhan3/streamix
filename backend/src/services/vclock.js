// ============================================================
// VECTOR CLOCKS (proposal §5.5 — conflict detection across regions)
//
// Each movie row carries { PK: n, US: m }. A region increments its own
// counter on every local edit. Comparing two clocks tells us whether one
// edit happened-before the other, or whether they were CONCURRENT (made in
// two regions without either having seen the other) — i.e. a conflict.
// ============================================================

function normalize(clock) {
  if (!clock) return {};
  return typeof clock === 'string' ? JSON.parse(clock) : clock;
}

/**
 * compare(a, b):
 *   'equal'      a and b are the same version
 *   'before'     a happened-before b  (b is newer)
 *   'after'      b happened-before a  (a is newer)
 *   'concurrent' neither dominates -> conflicting edits
 */
function compare(a, b) {
  a = normalize(a);
  b = normalize(b);
  let aBigger = false;
  let bBigger = false;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key] || 0;
    const y = b[key] || 0;
    if (x > y) aBigger = true;
    if (y > x) bBigger = true;
  }
  if (aBigger && bBigger) return 'concurrent';
  if (aBigger) return 'after';
  if (bBigger) return 'before';
  return 'equal';
}

/** Element-wise max — the clock of a version that has seen both inputs. */
function merge(a, b) {
  a = normalize(a);
  b = normalize(b);
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) out[key] = Math.max(out[key] || 0, value);
  return out;
}

function increment(clock, region) {
  const out = { ...normalize(clock) };
  out[region] = (out[region] || 0) + 1;
  return out;
}

/**
 * Deterministic last-write-wins tie-break for concurrent edits: the later
 * updated_at wins; equal timestamps fall back to the region code. Both
 * regions evaluate the same pair and so pick the same winner -> convergence.
 */
function lastWriteWins(local, remote) {
  const lt = new Date(local.updated_at).getTime();
  const rt = new Date(remote.updated_at).getTime();
  if (rt !== lt) return rt > lt ? 'remote' : 'local';
  return String(remote.last_writer_region) > String(local.last_writer_region) ? 'remote' : 'local';
}

module.exports = { compare, merge, increment, lastWriteWins, normalize };
