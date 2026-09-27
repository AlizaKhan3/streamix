// ============================================================
// GEO-REPLICATION between regions (proposal §5.5)
//
//  write side : a movie change and its outbox rows commit in ONE local
//               transaction (transactional outbox) — local writes never wait
//               on the slow / partition-prone inter-region link.
//  ship side  : a background worker delivers outbox rows to the target
//               region's gateway, retrying until the link is back
//               (eventual consistency across regions).
//  apply side : the receiving region compares VECTOR CLOCKS:
//                 incoming newer      -> apply
//                 incoming older/same -> ignore (stale / duplicate)
//                 concurrent          -> CONFLICT: resolved deterministically
//                                        (last-write-wins on updated_at) and
//                                        logged in the Global Directory
//               Rating aggregates use plain last-write-wins on
//               rating_updated_at, independent of the metadata clock.
// ============================================================
const { MOVIE_FRAGMENTS, fragmentIndexFor, movieGroup } = require('../config/topology');
const { transaction, write } = require('../db/router');
const { callRegion } = require('./rpc');
const vclock = require('./vclock');
const directory = require('./directory');
const { META_COLUMNS, RATING_COLUMNS, dbValue, insertMovie } = require('./movieRows');

const otherRegions = (licenseRegions, region) => (licenseRegions || []).filter((r) => r !== region);

/** Queue a change for other regions — must be called inside the movie write's transaction. */
async function enqueue(client, row, targets, op = 'upsert') {
  for (const target of targets) {
    await client.query(
      'INSERT INTO replication_outbox (content_id, op, target_region, payload) VALUES ($1, $2, $3, $4)',
      [row.content_id, op, target, JSON.stringify(row)]
    );
  }
}

// ---------------- apply side ----------------
async function applyIncoming({ region, op, row, from }) {
  let conflict = null;
  const result = await transaction(movieGroup(region, fragmentIndexFor(row.content_id)), async (c) => {
    const { rows } = await c.query('SELECT * FROM movies WHERE content_id = $1 FOR UPDATE', [row.content_id]);
    const local = rows[0];

    if (op === 'delete') {
      if (!local) return { action: 'noop', reason: 'not present' };
      const cmp = vclock.compare(row.vclock, local.vclock);
      if (cmp === 'before' || cmp === 'equal') return { action: 'ignored', reason: 'delete is older than local version', comparison: cmp };
      await c.query('DELETE FROM movies WHERE content_id = $1', [row.content_id]);
      return { action: 'deleted', comparison: cmp };
    }

    if (!local) {
      await insertMovie(c, row);
      return { action: 'inserted' };
    }

    const cmp = vclock.compare(row.vclock, local.vclock);
    let applyMeta = cmp === 'after';
    if (cmp === 'concurrent') {
      const winner = vclock.lastWriteWins(local, row);
      applyMeta = winner === 'remote';
      conflict = {
        contentId: row.content_id,
        detectedIn: region,
        remoteRegion: from,
        localClock: local.vclock,
        remoteClock: row.vclock,
        mergedClock: vclock.merge(local.vclock, row.vclock),
        winner,
        resolution: `concurrent edits; last-write-wins kept the ${winner} version (${winner === 'remote' ? row.last_writer_region : local.last_writer_region})`,
      };
    }
    const applyRating = new Date(row.rating_updated_at || 0) > new Date(local.rating_updated_at || 0);

    const sets = [];
    const values = [row.content_id];
    const set = (col, value) => {
      values.push(dbValue(col, value));
      sets.push(`${col} = $${values.length}`);
    };
    if (applyMeta) {
      META_COLUMNS.forEach((col) => set(col, row[col]));
      set('updated_at', row.updated_at);
      set('last_writer_region', row.last_writer_region);
    }
    if (cmp === 'after' || cmp === 'concurrent') set('vclock', vclock.merge(local.vclock, row.vclock));
    if (applyRating) RATING_COLUMNS.forEach((col) => set(col, row[col]));

    if (sets.length) await c.query(`UPDATE movies SET ${sets.join(', ')} WHERE content_id = $1`, values);

    const action = applyMeta ? 'updated' : applyRating ? 'rating-updated' : cmp === 'concurrent' ? 'kept-local' : 'ignored';
    return { action, comparison: cmp, ratingApplied: applyRating };
  });

  if (conflict) {
    await directory.logConflict(conflict).catch((e) => console.warn('[replication] could not log conflict:', e.message));
    result.conflict = conflict;
  }
  return result;
}

// ---------------- ship side ----------------
let paused = false;
let flushing = false;

function setPaused(value) {
  paused = !!value;
}

async function flush(region) {
  if (paused) return { skipped: 'paused' };
  if (flushing) return { skipped: 'already running' };
  flushing = true;
  const summary = { delivered: 0, failed: 0, errors: [] };
  try {
    for (const f of MOVIE_FRAGMENTS) {
      const group = movieGroup(region, f.index);
      let pending;
      try {
        pending = (await write(group, (c) =>
          c.query('SELECT * FROM replication_outbox WHERE delivered_at IS NULL ORDER BY id LIMIT 100')
        )).rows;
      } catch {
        continue; // fragment down — try again next tick
      }

      // Per-target FIFO: once a target fails, later changes for it wait, so
      // they are never applied out of order.
      const blocked = new Set();
      for (const item of pending) {
        if (blocked.has(item.target_region)) continue;
        try {
          const result = await callRegion(item.target_region, 'replication.apply', { op: item.op, row: item.payload, from: region });
          await write(group, (c) =>
            c.query(
              'UPDATE replication_outbox SET delivered_at = now(), attempts = attempts + 1, last_error = NULL, result = $2 WHERE id = $1',
              [item.id, JSON.stringify(result)]
            )
          );
          summary.delivered++;
        } catch (err) {
          blocked.add(item.target_region);
          summary.failed++;
          summary.errors.push(`${item.target_region}: ${err.message}`);
          await write(group, (c) =>
            c.query('UPDATE replication_outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [item.id, err.message])
          ).catch(() => {});
        }
      }
    }
  } finally {
    flushing = false;
  }
  return summary;
}

function startWorker(region) {
  const interval = Number(process.env.REPLICATION_INTERVAL_MS || 3000);
  const timer = setInterval(() => {
    flush(region).catch((e) => console.warn('[replication] flush failed:', e.message));
  }, interval);
  timer.unref();
}

async function status(region) {
  const fragments = [];
  for (const f of MOVIE_FRAGMENTS) {
    try {
      const data = await write(movieGroup(region, f.index), async (c) => {
        const counts = await c.query(
          `SELECT count(*) FILTER (WHERE delivered_at IS NULL)::int AS pending,
                  count(*) FILTER (WHERE delivered_at IS NOT NULL)::int AS delivered
           FROM replication_outbox`
        );
        const recent = await c.query(
          `SELECT id, content_id, op, target_region, payload->>'title' AS title, created_at, delivered_at, attempts, last_error, result
           FROM replication_outbox ORDER BY id DESC LIMIT 15`
        );
        return { ...counts.rows[0], recent: recent.rows };
      });
      fragments.push({ fragment: f.label, ok: true, ...data });
    } catch (err) {
      fragments.push({ fragment: f.label, ok: false, error: err.message });
    }
  }
  return { region, paused, fragments };
}

module.exports = { enqueue, otherRegions, applyIncoming, flush, startWorker, setPaused, status };
