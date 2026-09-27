// ============================================================
// ADMIN MODULE (proposal §3.5) — acts on the region this gateway serves.
//   movies        : add / edit / delete / licence regions, TMDb sync
//   reviews       : moderation (each change is a 2PC across review + movie node)
//   users         : role and block/unblock for accounts homed in this region
//   distributed   : replication outbox, conflicts, 2PC/saga logs, failover,
//                   and live demos (concurrent-edit conflict, network partition)
// ============================================================
const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { LOCAL_REGION, REGION_CODES } = require('../config/topology');
const movies = require('../services/movies');
const reviews = require('../services/reviews');
const users = require('../services/users');
const replication = require('../services/replication');
const directory = require('../services/directory');
const health = require('../services/health');
const tmdb = require('../services/tmdbService');
const { recentLog } = require('../services/twoPhaseCommit');
const { callRegion, callRegionControl, setPartition, isPartitioned } = require('../services/rpc');
const { httpError } = require('../utils/httpError');

router.use(requireAuth, requireAdmin);

const OTHER_REGIONS = REGION_CODES.filter((r) => r !== LOCAL_REGION);

// ---------------- movies ----------------
router.get('/movies', async (req, res) => {
  res.json(await movies.search(LOCAL_REGION, { q: req.query.q, sort: req.query.sort || 'title', page: req.query.page, limit: 50 }));
});

router.post('/movies', async (req, res) => {
  res.status(201).json(await movies.createMovie(LOCAL_REGION, req.body || {}));
});

router.patch('/movies/:id', async (req, res) => {
  res.json(await movies.updateMovie(LOCAL_REGION, Number(req.params.id), req.body || {}));
});

router.delete('/movies/:id', async (req, res) => {
  res.json(await movies.deleteMovie(LOCAL_REGION, Number(req.params.id)));
});

// ---------------- TMDb ----------------
router.get('/tmdb/status', (_req, res) => {
  res.json({ configured: tmdb.isConfigured(), genres: Object.keys(tmdb.GENRES) });
});

router.post('/tmdb/search', async (req, res) => {
  const results = await tmdb.searchTmdb(String(req.body?.query || ''));
  res.json(results.slice(0, 20).map((r) => ({
    tmdb_id: r.id,
    media_type: r.media_type,
    title: r.title || r.name,
    release_year: parseInt((r.release_date || r.first_air_date || '').slice(0, 4), 10) || null,
    poster_path: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null,
  })));
});

async function syncOne(tmdbId, mediaType, licenseRegions) {
  const input = tmdb.toMovieInput(await tmdb.getDetails(tmdbId, mediaType), mediaType);
  const existing = await movies.getMovie(LOCAL_REGION, input.tmdb_id);
  if (existing) return { action: 'updated', movie: await movies.updateMovie(LOCAL_REGION, existing.content_id, input) };
  return {
    action: 'created',
    movie: await movies.createMovie(LOCAL_REGION, { ...input, content_id: input.tmdb_id, license_regions: licenseRegions || [LOCAL_REGION] }),
  };
}

/** POST /admin/tmdb/sync { tmdbId, mediaType, licenseRegions: ['PK','US'] } */
router.post('/tmdb/sync', async (req, res) => {
  const { tmdbId, mediaType = 'movie', licenseRegions } = req.body || {};
  if (!tmdbId) throw httpError(400, 'tmdbId is required');
  res.status(201).json(await syncOne(Number(tmdbId), mediaType === 'tv' ? 'tv' : 'movie', licenseRegions));
});

/** POST /admin/tmdb/discover { genre: 'Action', year, language, licenseRegions, limit } */
router.post('/tmdb/discover', async (req, res) => {
  const { genre, year, language, licenseRegions, limit = 10 } = req.body || {};
  const list = await tmdb.discoverTmdb({ genreId: tmdb.GENRES[genre] || undefined, year, language });
  const out = { created: 0, updated: 0, failed: 0, titles: [] };
  for (const item of list.slice(0, Math.min(20, Number(limit) || 10))) {
    try {
      const r = await syncOne(item.id, 'movie', licenseRegions);
      out[r.action]++;
      out.titles.push(r.movie.title);
    } catch (err) {
      out.failed++;
      console.warn(`[tmdb] discover ${item.id}: ${err.message}`);
    }
  }
  res.json(out);
});

/** Fills posters/cast/trailers for seeded titles that carry a TMDb id (only when titles match). */
router.post('/tmdb/enrich', async (_req, res) => {
  const { rows } = await movies.scatter(LOCAL_REGION, 'SELECT * FROM movies WHERE tmdb_id IS NOT NULL AND poster_path IS NULL LIMIT 60');
  const out = { enriched: 0, skipped: 0, failed: 0 };
  for (const m of rows) {
    try {
      const input = tmdb.toMovieInput(await tmdb.getDetails(m.tmdb_id, m.media_type), m.media_type);
      if (input.title.toLowerCase() !== m.title.toLowerCase()) {
        out.skipped++;
        continue;
      }
      const { poster_path, backdrop_path, cast_members, trailer_key, overview, popularity } = input;
      await movies.updateMovie(LOCAL_REGION, m.content_id, { poster_path, backdrop_path, cast_members, trailer_key, overview, popularity });
      out.enriched++;
    } catch {
      out.failed++;
    }
  }
  res.json(out);
});

// ---------------- review moderation ----------------
router.get('/reviews', async (req, res) => {
  res.json(await reviews.adminList({ region: LOCAL_REGION, status: req.query.status, q: req.query.q }));
});

router.patch('/reviews/:id', async (req, res) => {
  res.json(await reviews.moderate({ region: LOCAL_REGION, reviewId: Number(req.params.id), status: req.body?.status }));
});

// ---------------- user management ----------------
router.get('/users', async (req, res) => {
  res.json(await users.listUsers({ region: LOCAL_REGION, q: req.query.q }));
});

router.patch('/users/:id', async (req, res) => {
  if (req.params.id === req.user.sub && (req.body?.status === 'blocked' || req.body?.role === 'user')) {
    throw httpError(400, "You can't block or demote your own account");
  }
  res.json(await users.updateUser({ region: LOCAL_REGION, userId: req.params.id, role: req.body?.role, status: req.body?.status }));
});

// ---------------- distributed-system operations ----------------
router.get('/replication', async (_req, res) => {
  const [status, conflicts] = await Promise.all([
    replication.status(LOCAL_REGION),
    directory.listConflicts(20).catch(() => []),
  ]);
  res.json({ ...status, conflicts });
});

router.post('/replication/flush', async (_req, res) => {
  res.json(await replication.flush(LOCAL_REGION));
});

router.get('/transactions', async (_req, res) => {
  res.json(await recentLog(LOCAL_REGION));
});

/** POST /admin/failover { kind: 'user' | 'movie-f0' | 'movie-f1' } — promote that group's replica. */
router.post('/failover', async (req, res) => {
  res.json(await health.promote({ region: LOCAL_REGION, kind: req.body?.kind }));
});

/**
 * Demo: edit the same globally-licensed title in every region at the same
 * moment (replication paused), then let replication run. Each region sees a
 * CONCURRENT vector clock, resolves it the same way, and they converge.
 */
router.post('/demo/conflict', async (req, res) => {
  const contentId = Number(req.body?.contentId);
  const movie = await movies.getMovie(LOCAL_REGION, contentId);
  if (!movie) throw httpError(404, `Movie ${contentId} is not stored in ${LOCAL_REGION}`);
  const regions = movie.license_regions;
  if (regions.length < 2) throw httpError(400, 'Pick a globally-licensed title (licensed in more than one region)');

  await Promise.all(regions.map((r) => callRegion(r, 'replication.setPaused', { paused: true })));
  let edits;
  try {
    const stamp = new Date().toISOString();
    edits = await Promise.all(
      regions.map((r) => callRegion(r, 'movies.demoEdit', { region: r, contentId, note: `Edited in ${r} at ${stamp}` }))
    );
  } finally {
    await Promise.all(regions.map((r) => callRegion(r, 'replication.setPaused', { paused: false }).catch(() => {})));
  }

  for (const r of regions) await callRegion(r, 'replication.flush', { region: r }).catch(() => {});
  const after = await Promise.all(regions.map((r) => callRegion(r, 'movies.get', { region: r, contentId }).catch(() => null)));
  const conflicts = await directory.listConflicts(regions.length).catch(() => []);

  res.json({
    edits: edits.map((m, i) => ({ region: regions[i], vclock: m.vclock, admin_note: m.admin_note })),
    after: after.map((m, i) => ({ region: regions[i], vclock: m?.vclock, admin_note: m?.admin_note })),
    converged: after.every((m) => m && m.admin_note === after[0]?.admin_note),
    conflicts,
  });
});

/** Demo: cut (or heal) the inter-region link in both directions. */
router.post('/demo/partition', async (req, res) => {
  const enabled = !!req.body?.enabled;
  for (const r of OTHER_REGIONS) {
    setPartition(r, enabled);
    await callRegionControl(r, '/internal/partition', { enabled }).catch(() => {});
  }
  res.json({ region: LOCAL_REGION, partitioned: OTHER_REGIONS.filter(isPartitioned) });
});

module.exports = router;
