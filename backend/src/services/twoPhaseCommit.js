// ============================================================
// TWO-PHASE COMMIT COORDINATOR (proposal §5.3 — distributed transactions)
//
// Uses PostgreSQL's native 2PC support:
//   work     : BEGIN on every participant node, run the statements
//   phase 1  : PREPARE TRANSACTION '<gid>' on every node (each node votes YES
//              by durably preparing; any error = NO vote -> global abort)
//   decision : COMMIT is recorded in the coordinator log (twopc_log on the
//              region's review node) — this is the commit point
//   phase 2  : COMMIT PREPARED '<gid>' on every node
//
// If the gateway or a node crashes between phase 1 and phase 2, the
// prepared transactions stay "in doubt" on the nodes; recoverInDoubt()
// (run at start-up and every 30 s) resolves them from the coordinator log.
// ============================================================
const crypto = require('crypto');
const { MOVIE_FRAGMENTS, movieGroup, reviewGroup } = require('../config/topology');
const { connectWriter, write } = require('../db/router');

function newTxId() {
  return `stx_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * participants: ordered { name: group } — BEGIN/locks happen in this order.
 * work(clients, log): runs all statements; throw to abort.
 */
async function runTwoPhaseCommit({ region, label, participants, work }) {
  const txId = newTxId();
  const started = Date.now();
  const trace = [];
  const log = (step, phase = 'work') => trace.push({ ms: Date.now() - started, phase, step });

  const conns = {};
  const prepared = new Set();
  const releaseAll = () => Object.values(conns).forEach((c) => c.client.release());

  try {
    for (const [name, group] of Object.entries(participants)) {
      conns[name] = await connectWriter(group);
      await conns[name].client.query('BEGIN');
      log(`BEGIN on ${conns[name].node}`);
    }

    const clients = Object.fromEntries(Object.entries(conns).map(([n, c]) => [n, c.client]));
    await work(clients, log);

    for (const [name, conn] of Object.entries(conns)) {
      await conn.client.query(`PREPARE TRANSACTION '${txId}__${name}'`);
      prepared.add(name);
      log(`${conn.node} voted YES (PREPARE TRANSACTION)`, 'phase 1');
    }

    await write(reviewGroup(region), (c) =>
      c.query(`INSERT INTO twopc_log (tx_id, label, participants, decision) VALUES ($1, $2, $3, 'commit')`, [
        txId, label, JSON.stringify(Object.fromEntries(Object.entries(conns).map(([n, c]) => [n, c.node]))),
      ])
    );
    log('decision COMMIT written to coordinator log', 'decision');
  } catch (err) {
    log(`ABORT — ${err.message}`, 'decision');
    for (const [name, conn] of Object.entries(conns)) {
      if (prepared.has(name)) {
        await conn.client.query(`ROLLBACK PREPARED '${txId}__${name}'`).catch(() => {});
        log(`ROLLBACK PREPARED on ${conn.node}`, 'phase 2');
      } else {
        await conn.client.query('ROLLBACK').catch(() => {});
        log(`ROLLBACK on ${conn.node}`, 'phase 2');
      }
    }
    await write(reviewGroup(region), (c) =>
      c.query(`INSERT INTO twopc_log (tx_id, label, participants, decision, completed_at) VALUES ($1, $2, '{}', 'abort', now())`, [txId, label])
    ).catch(() => {});
    releaseAll();
    err.details = { ...(err.details || {}), transaction: { protocol: '2pc', txId, outcome: 'aborted', trace } };
    throw err;
  }

  const inDoubt = [];
  for (const [name, conn] of Object.entries(conns)) {
    try {
      await conn.client.query(`COMMIT PREPARED '${txId}__${name}'`);
      log(`COMMIT PREPARED on ${conn.node}`, 'phase 2');
    } catch (err) {
      inDoubt.push(conn.node);
      log(`${conn.node} unreachable in phase 2 — left prepared, recovery will commit it (${err.message})`, 'phase 2');
    }
  }
  if (!inDoubt.length) {
    await write(reviewGroup(region), (c) => c.query('UPDATE twopc_log SET completed_at = now() WHERE tx_id = $1', [txId])).catch(() => {});
  }
  releaseAll();
  return { protocol: '2pc', txId, outcome: 'committed', inDoubt, trace };
}

/** Resolve prepared-but-unfinished transactions using the coordinator log. */
async function recoverInDoubt(region) {
  const groups = [reviewGroup(region), ...MOVIE_FRAGMENTS.map((f) => movieGroup(region, f.index))];
  const resolved = [];
  for (const group of groups) {
    try {
      await write(group, async (c) => {
        const { rows } = await c.query(
          `SELECT gid, prepared FROM pg_prepared_xacts WHERE database = current_database() AND gid LIKE 'stx\\_%'`
        );
        for (const { gid, prepared } of rows) {
          const txId = gid.split('__')[0];
          const decision = await write(reviewGroup(region), (rc) =>
            rc.query('SELECT decision FROM twopc_log WHERE tx_id = $1', [txId])
          ).then((r) => r.rows[0]?.decision).catch(() => undefined);

          if (decision === undefined && Date.now() - new Date(prepared).getTime() < 30000) continue; // coordinator may still be mid-flight
          const action = decision === 'commit' ? 'COMMIT PREPARED' : 'ROLLBACK PREPARED'; // presumed abort
          await c.query(`${action} '${gid}'`);
          resolved.push({ gid, action, node: group.primaryName });
        }
      });
    } catch {
      /* node down — retry next round */
    }
  }
  if (resolved.length) console.log('[2pc] recovered in-doubt transactions:', resolved);
  return resolved;
}

function startRecovery(region) {
  recoverInDoubt(region).catch(() => {});
  setInterval(() => recoverInDoubt(region).catch(() => {}), 30000).unref();
}

async function recentLog(region, limit = 20) {
  return write(reviewGroup(region), async (c) => {
    const [twopc, saga, prepared] = await Promise.all([
      c.query('SELECT * FROM twopc_log ORDER BY created_at DESC LIMIT $1', [limit]),
      c.query('SELECT * FROM saga_log ORDER BY id DESC LIMIT $1', [limit * 3]),
      c.query(`SELECT gid, prepared FROM pg_prepared_xacts WHERE database = current_database()`),
    ]);
    return { twopc: twopc.rows, saga: saga.rows, inDoubtOnReviewNode: prepared.rows };
  });
}

module.exports = { runTwoPhaseCommit, recoverInDoubt, startRecovery, recentLog };
