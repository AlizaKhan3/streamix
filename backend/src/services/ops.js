// ============================================================
// OPERATION REGISTRY — everything one region may ask another region to do.
// callRegion() runs these in-process for the local region, or through
// POST /internal/rpc on the target region's gateway. Keeping one allow-list
// means the inter-region surface is explicit and small.
// ============================================================
const users = require('./users');
const watchlist = require('./watchlist');
const reviews = require('./reviews');
const replication = require('./replication');
const movies = require('./movies');
const health = require('./health');
const { httpError } = require('../utils/httpError');

const ops = {
  // user module — home region
  'user.register': users.register,
  'user.login': users.login,
  'user.getProfile': users.getProfile,
  'user.updateProfile': users.updateProfile,

  // watchlist / history — home region
  'watchlist.list': watchlist.list,
  'watchlist.statusOf': watchlist.statusOf,
  'watchlist.add': watchlist.add,
  'watchlist.setStatus': watchlist.setStatus,
  'watchlist.remove': watchlist.remove,
  'watchlist.recordHistory': watchlist.recordHistory,
  'watchlist.history': watchlist.history,

  // reviews — movie's origin region
  'reviews.submit': reviews.submit,
  'reviews.listForMovie': reviews.listForMovie,
  'reviews.byUser': reviews.byUser,
  'reviews.aggregate': reviews.aggregate,

  // geo-replication
  'replication.apply': replication.applyIncoming,
  'replication.setPaused': ({ paused }) => replication.setPaused(paused),
  'replication.flush': ({ region }) => replication.flush(region),
  'movies.get': ({ region, contentId }) => movies.getMovie(region, contentId),
  'movies.demoEdit': ({ region, contentId, note }) => movies.updateMovie(region, contentId, { admin_note: note }),

  // system
  'system.topology': health.regionTopology,
};

async function runOp(op, args) {
  const fn = ops[op];
  if (!fn) throw httpError(400, `Unknown operation ${op}`);
  return fn(args || {});
}

module.exports = { runOp, OPS: Object.keys(ops) };
