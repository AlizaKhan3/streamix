// ============================================================
// FRAGMENT / REPLICA ROUTER
//
// Turns a logical operation into a connection on the right physical node:
//   * writes      -> the group's primary (or the promoted replica after failover)
//   * reads       -> the replica first, falling back to the primary
//   * readPrimary -> strongly-consistent reads (User DB / auth), never a replica
//
// FAILOVER: if a primary is unreachable and its replica has been promoted
// (pg_promote(), see routes/admin.js and scripts/failover-demo.ps1), the
// router notices the replica is no longer in recovery and permanently
// switches that group's writes to it.
// ============================================================
const { httpError } = require('../utils/httpError');

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'EHOSTUNREACH',
  '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006',
]);

function isConnectionError(err) {
  if (!err) return false;
  if (CONNECTION_ERROR_CODES.has(err.code)) return true;
  return /Connection terminated|timeout exceeded when trying to connect|ECONNREFUSED|getaddrinfo/i.test(err.message || '');
}

function unavailable(node, cause) {
  const err = httpError(503, `Database node ${node} is unavailable`, { node });
  err.cause = cause;
  return err;
}

async function detectPromotion(group) {
  if (!group.replica || group.failedOver) return group.failedOver;
  try {
    const { rows } = await group.replica.query('SELECT pg_is_in_recovery() AS standby');
    if (!rows[0].standby) {
      group.failedOver = true;
      console.warn(`[router] ${group.key}: replica ${group.replicaName} was promoted — writes now go there`);
    }
  } catch {
    /* replica unreachable too */
  }
  return group.failedOver;
}

function currentWriter(group) {
  return group.failedOver
    ? { pool: group.replica, node: group.replicaName, role: 'primary (promoted replica)' }
    : { pool: group.primary, node: group.primaryName, role: 'primary' };
}

/** A dedicated client on the group's current primary (for multi-statement transactions). */
async function connectWriter(group) {
  const writer = currentWriter(group);
  try {
    const client = await writer.pool.connect();
    return { client, node: writer.node, role: writer.role };
  } catch (err) {
    if (isConnectionError(err) && (await detectPromotion(group))) {
      const promoted = currentWriter(group);
      const client = await promoted.pool.connect();
      return { client, node: promoted.node, role: promoted.role };
    }
    throw isConnectionError(err) ? unavailable(writer.node, err) : err;
  }
}

/** Runs fn(client, meta) on the primary; the client is released afterwards. */
async function write(group, fn) {
  const { client, node, role } = await connectWriter(group);
  try {
    return await fn(client, { node, role });
  } finally {
    client.release();
  }
}

/** Transaction helper on the primary. */
async function transaction(group, fn) {
  return write(group, async (client, meta) => {
    await client.query('BEGIN');
    try {
      const result = await fn(client, meta);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    }
  });
}

/** Consistent read: primary only (CP stores such as the User DB). */
async function readPrimary(group, fn) {
  return write(group, (client, meta) => fn(client, meta));
}

/** Available read: replica first, then primary (AP stores such as the Movie DB). */
async function read(group, fn) {
  const order = [];
  if (group.failedOver) {
    order.push({ pool: group.replica, node: group.replicaName, role: 'primary (promoted replica)' });
  } else {
    if (group.replica) order.push({ pool: group.replica, node: group.replicaName, role: 'replica' });
    order.push({ pool: group.primary, node: group.primaryName, role: 'primary' });
  }

  let lastErr;
  for (const target of order) {
    try {
      return await fn(target.pool, { node: target.node, role: target.role });
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      lastErr = err;
    }
  }
  if (!group.failedOver && (await detectPromotion(group))) return read(group, fn);
  throw unavailable(group.key, lastErr);
}

module.exports = { isConnectionError, connectWriter, write, transaction, read, readPrimary, detectPromotion };
