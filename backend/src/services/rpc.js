// ============================================================
// INTER-REGION LINK
//
// Gateways never open connections to another region's databases. When a
// request needs data that lives elsewhere (a roaming user's home region,
// a movie's origin region, geo-replication) the local gateway calls the
// other region's gateway over HTTP: callRegion('US', 'watchlist.list', ...).
// If the target is the local region the op simply runs in-process, so
// callers never need to know where the data lives (LOCATION TRANSPARENCY).
//
// A network partition between regions can be simulated from the admin
// panel; while it is on, every cross-region call fails exactly as it would
// if the inter-region link were down — useful for demoing CAP trade-offs.
// ============================================================
const axios = require('axios');
const { LOCAL_REGION, gatewayUrl } = require('../config/topology');
const { httpError } = require('../utils/httpError');

const partitionedFrom = new Set();

function setPartition(region, enabled) {
  if (enabled) partitionedFrom.add(region);
  else partitionedFrom.delete(region);
}

const isPartitioned = (region) => partitionedFrom.has(region);

function unreachable(region, reason) {
  return httpError(503, `Region ${region} is unreachable (${reason})`, { code: 'REGION_UNREACHABLE', region });
}

async function post(region, path, body) {
  try {
    const { data } = await axios.post(`${gatewayUrl(region)}${path}`, body, {
      headers: { 'x-internal-secret': process.env.INTERNAL_SECRET },
      timeout: 6000,
    });
    return data;
  } catch (err) {
    if (err.response) {
      throw httpError(err.response.status, err.response.data?.error || `Region ${region} returned ${err.response.status}`, err.response.data?.details);
    }
    throw unreachable(region, 'gateway down or inter-region link failed');
  }
}

/** Runs a registered operation in `region` — in-process if local, over the inter-region link otherwise. */
async function callRegion(region, op, args = {}) {
  if (region === LOCAL_REGION) {
    const { runOp } = require('./ops');
    return runOp(op, args);
  }
  if (partitionedFrom.has(region)) throw unreachable(region, 'simulated network partition');
  const data = await post(region, '/internal/rpc', { op, args, from: LOCAL_REGION });
  return data.result;
}

/** Control-plane call that ignores the simulated partition (used to toggle it on both sides). */
async function callRegionControl(region, path, body) {
  return post(region, path, { ...body, from: LOCAL_REGION });
}

module.exports = { callRegion, callRegionControl, setPartition, isPartitioned };
