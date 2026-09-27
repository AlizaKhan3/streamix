// ============================================================
// CATALOG — always served by THIS region's own movie fragments, so the
// user only ever sees titles licensed where they currently are.
// ============================================================
const router = require('express').Router();
const { LOCAL_REGION } = require('../config/topology');
const movies = require('../services/movies');
const directory = require('../services/directory');
const { httpError } = require('../utils/httpError');

router.get('/trending', async (req, res) => {
  const { results } = await movies.trending(LOCAL_REGION, Math.min(50, Number(req.query.limit) || 20));
  res.json(results);
});

/** GET /catalog/search?q=&genre=&year=&language=&sort=popularity|rating|year|oldest|title&page= */
router.get('/search', async (req, res) => {
  res.json(await movies.search(LOCAL_REGION, req.query));
});

router.get('/filters', async (_req, res) => {
  res.json({ ...(await movies.filters(LOCAL_REGION)), sorts: Object.keys(movies.SORTS) });
});

router.get('/movie/:id', async (req, res) => {
  const contentId = Number(req.params.id);
  if (!Number.isFinite(contentId)) throw httpError(400, 'Invalid id');

  const movie = await movies.getMovie(LOCAL_REGION, contentId);
  if (movie) return res.json(movie);

  // Not stored here -> ask the Global Directory whether it's licensed elsewhere.
  const entry = await directory.catalogEntry(contentId).catch(() => null);
  if (entry) {
    throw httpError(451, `"${entry.title}" is not licensed in region ${LOCAL_REGION}`, {
      title: entry.title,
      availableIn: entry.regions,
    });
  }
  throw httpError(404, 'Title not found');
});

/**
 * Cross-region discovery through the Global Catalog Directory: finds titles
 * even when they physically live only in another region.
 */
router.get('/global-search', async (req, res) => {
  const entries = await directory.searchCatalog(req.query.q, 40);
  res.json({
    region: LOCAL_REGION,
    results: entries.map((e) => ({
      content_id: Number(e.content_id),
      title: e.title,
      poster_path: e.poster_path,
      release_year: e.release_year,
      regions: e.regions,
      license_scope: e.license_scope,
      origin_region: e.origin_region,
      availableHere: e.regions.includes(LOCAL_REGION),
    })),
  });
});

module.exports = router;
