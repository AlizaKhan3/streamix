// ============================================================
// CLUSTER TOPOLOGY — the one place that knows every physical node.
//
// Two regional deployments (PK = South Asia, US = North America), each
// with its own full stack, plus one Global Catalog Directory node.
// Nothing else in the codebase hard-codes a host or port; everything
// asks this module (DISTRIBUTION / LOCATION TRANSPARENCY).
// ============================================================
require('./env');
const { Pool } = require('pg');

const REGIONS = {
  PK: { code: 'PK', name: 'South Asia (Pakistan)', prefix: 'pk', portBase: 5500, gatewayHostPort: 4001 },
  US: { code: 'US', name: 'North America (United States)', prefix: 'us', portBase: 5600, gatewayHostPort: 4002 },
};
const REGION_CODES = Object.keys(REGIONS);

const LOCAL_REGION = (process.env.REGION || 'PK').toUpperCase();
if (!REGIONS[LOCAL_REGION]) throw new Error(`Unknown REGION "${LOCAL_REGION}" (expected PK or US)`);

// 'docker' -> containers reach each other by service name on port 5432
// 'host'   -> running on the host machine, nodes reached via published ports
const DB_MODE = process.env.DB_MODE || 'docker';

// ---------------- Horizontal fragmentation of the movie table ----------------
const FRAGMENT_BOUNDARY = 300000;
const MOVIE_FRAGMENTS = [
  { index: 0, label: 'F0', predicate: `content_id < ${FRAGMENT_BOUNDARY}` },
  { index: 1, label: 'F1', predicate: `content_id >= ${FRAGMENT_BOUNDARY}` },
];

function fragmentIndexFor(contentId) {
  return Number(contentId) < FRAGMENT_BOUNDARY ? 0 : 1;
}

// ---------------- Physical nodes ----------------
const NODE_ROLES = {
  'user-primary': { offset: 1, db: 'user_db' },
  'user-replica': { offset: 2, db: 'user_db' },
  'movie-f0-primary': { offset: 11, db: 'movie_db' },
  'movie-f0-replica': { offset: 12, db: 'movie_db' },
  'movie-f1-primary': { offset: 21, db: 'movie_db' },
  'movie-f1-replica': { offset: 22, db: 'movie_db' },
  review: { offset: 31, db: 'review_db' },
  watchlist: { offset: 41, db: 'watchlist_db' },
};
const DIRECTORY_NODE = { name: 'global-directory', hostPort: 5700, db: 'directory_db' };

function nodeName(region, role) {
  return `${REGIONS[region].prefix}-${role}`;
}

function nodeEndpoint(name) {
  if (name === DIRECTORY_NODE.name) {
    return DB_MODE === 'host'
      ? { host: 'localhost', port: DIRECTORY_NODE.hostPort, database: DIRECTORY_NODE.db }
      : { host: name, port: 5432, database: DIRECTORY_NODE.db };
  }
  const [prefix, ...rest] = name.split('-');
  const role = rest.join('-');
  const region = REGION_CODES.find((r) => REGIONS[r].prefix === prefix);
  if (!region || !NODE_ROLES[role]) throw new Error(`Unknown node ${name}`);
  const { offset, db } = NODE_ROLES[role];
  return DB_MODE === 'host'
    ? { host: 'localhost', port: REGIONS[region].portBase + offset, database: db }
    : { host: name, port: 5432, database: db };
}

// ---------------- Connection pools (one per physical node, lazily created) ----------------
const pools = new Map();

function poolFor(name) {
  if (!pools.has(name)) {
    const pool = new Pool({
      ...nodeEndpoint(name),
      user: process.env.DB_USER || 'app',
      password: process.env.DB_PASSWORD || 'app_pass',
      max: 8,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
    });
    // An idle client dying (e.g. its node was stopped for a failover demo)
    // must not crash the gateway.
    pool.on('error', (err) => console.warn(`[pool ${name}] ${err.message}`));
    pools.set(name, pool);
  }
  return pools.get(name);
}

// ---------------- Replicated groups (primary + optional replica) ----------------
const groups = new Map();

function makeGroup(key, primaryName, replicaName) {
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      primaryName,
      replicaName,
      primary: poolFor(primaryName),
      replica: replicaName ? poolFor(replicaName) : null,
      failedOver: false, // true once the replica has been promoted to primary
    });
  }
  return groups.get(key);
}

const userGroup = (region) =>
  makeGroup(`${region}:user`, nodeName(region, 'user-primary'), nodeName(region, 'user-replica'));

const movieGroup = (region, fragIndex) =>
  makeGroup(
    `${region}:movie-f${fragIndex}`,
    nodeName(region, `movie-f${fragIndex}-primary`),
    nodeName(region, `movie-f${fragIndex}-replica`)
  );

const reviewGroup = (region) => makeGroup(`${region}:review`, nodeName(region, 'review'), null);
const watchlistGroup = (region) => makeGroup(`${region}:watchlist`, nodeName(region, 'watchlist'), null);
const directoryGroup = () => makeGroup('GLOBAL:directory', DIRECTORY_NODE.name, null);

/** Every node of a region, in display order, with the group it belongs to. */
function regionNodes(region) {
  const list = [];
  const push = (group, kind) => {
    list.push({ name: group.primaryName, kind, role: 'primary', group });
    if (group.replicaName) list.push({ name: group.replicaName, kind, role: 'replica', group });
  };
  push(userGroup(region), 'user');
  MOVIE_FRAGMENTS.forEach((f) => push(movieGroup(region, f.index), `movie-${f.label.toLowerCase()}`));
  push(reviewGroup(region), 'review');
  push(watchlistGroup(region), 'watchlist');
  return list;
}

// ---------------- Regional API gateways ----------------
function gatewayUrl(region) {
  const override = process.env[`GATEWAY_${region}_URL`];
  if (override) return override;
  return DB_MODE === 'host'
    ? `http://localhost:${REGIONS[region].gatewayHostPort}`
    : `http://api-${REGIONS[region].prefix}:4000`;
}

async function closeAll() {
  await Promise.all([...pools.values()].map((p) => p.end().catch(() => {})));
}

module.exports = {
  REGIONS,
  REGION_CODES,
  LOCAL_REGION,
  DB_MODE,
  FRAGMENT_BOUNDARY,
  MOVIE_FRAGMENTS,
  fragmentIndexFor,
  nodeName,
  nodeEndpoint,
  poolFor,
  userGroup,
  movieGroup,
  reviewGroup,
  watchlistGroup,
  directoryGroup,
  regionNodes,
  DIRECTORY_NODE,
  gatewayUrl,
  closeAll,
};
