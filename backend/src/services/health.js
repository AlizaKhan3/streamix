// ============================================================
// TOPOLOGY / HEALTH / FAILOVER
// Shows every node of a region: up/down, whether it is actually running as
// primary or standby, replication lag, and lets an admin promote a replica.
// ============================================================
const {
  REGIONS, MOVIE_FRAGMENTS, FRAGMENT_BOUNDARY, DIRECTORY_NODE,
  poolFor, regionNodes, userGroup, movieGroup, directoryGroup,
} = require('../config/topology');
const { httpError } = require('../utils/httpError');

const STATUS_SQL = `
  SELECT pg_is_in_recovery() AS standby,
         (SELECT count(*) FROM pg_stat_replication)::int AS streaming_replicas,
         CASE WHEN pg_is_in_recovery()
              THEN COALESCE(EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()), 0)
         END AS lag_seconds`;

async function nodeStatus(name) {
  const started = Date.now();
  try {
    const { rows } = await poolFor(name).query(STATUS_SQL);
    const r = rows[0];
    return {
      up: true,
      runningAs: r.standby ? 'standby' : 'primary',
      streamingReplicas: r.streaming_replicas,
      lagSeconds: r.lag_seconds == null ? null : Number(Number(r.lag_seconds).toFixed(2)),
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return { up: false, error: err.message };
  }
}

async function regionTopology({ region }) {
  const nodes = regionNodes(region);
  const statuses = await Promise.all(nodes.map((n) => nodeStatus(n.name)));
  return {
    region,
    name: REGIONS[region].name,
    fragments: MOVIE_FRAGMENTS.map((f) => ({ label: f.label, predicate: f.predicate })),
    fragmentBoundary: FRAGMENT_BOUNDARY,
    nodes: nodes.map((n, i) => ({
      name: n.name,
      kind: n.kind,
      configuredRole: n.role,
      failedOver: n.group.failedOver,
      ...statuses[i],
    })),
  };
}

async function directoryStatus() {
  return { name: DIRECTORY_NODE.name, kind: 'directory', configuredRole: 'primary', ...(await nodeStatus(directoryGroup().primaryName)) };
}

function groupFor(region, kind) {
  if (kind === 'user') return userGroup(region);
  const match = /^movie-f(\d)$/.exec(kind);
  if (match && MOVIE_FRAGMENTS[Number(match[1])]) return movieGroup(region, Number(match[1]));
  throw httpError(400, 'kind must be user, movie-f0 or movie-f1');
}

/** Promote a group's replica to primary (manual failover, as in the proposal's scope). */
async function promote({ region, kind }) {
  const group = groupFor(region, kind);
  if (group.failedOver) return { alreadyPromoted: true, node: group.replicaName };
  const { rows } = await group.replica.query('SELECT pg_promote(true, 30) AS promoted');
  if (!rows[0].promoted) throw httpError(500, `Promotion of ${group.replicaName} did not complete`);
  group.failedOver = true;
  return { promoted: group.replicaName, previousPrimary: group.primaryName, note: 'Writes for this group now go to the promoted node.' };
}

module.exports = { regionTopology, directoryStatus, promote, nodeStatus };
