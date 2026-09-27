const router = require('express').Router();
const { resolveRegion } = require('../middleware/region');
const {
  movieReadConn, allMovieReadConns, movieReadConnsByRegionPriority,
} = require('../db/shardRouter');

router.use(resolveRegion);

/**
 * GET /catalog/movie/:id
 * contentId is the shard key, so this is a single targeted read —
 * the router goes straight to the one shard that can possibly hold it.
 */
router.get('/movie/:id', async (req, res) => {
  const contentId = Number(req.params.id);
  try {
    const { rows } = await movieReadConn(contentId).query(
      `SELECT * FROM movies WHERE content_id = $1`, [contentId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ ...rows[0], _clientRegion: req.clientRegion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

/**
 * GET /catalog/nearby — FAST single-shard path preferred for the client's
 * region (from X-Client-Region). Falls back to the other shards if the
 * preferred region returns nothing / is down.
 */
router.get('/nearby', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const ordered = movieReadConnsByRegionPriority(req.clientRegion);

  try {
    for (const shard of ordered) {
      try {
        const { rows } = await shard.conn.query(
          `SELECT * FROM movies ORDER BY popularity DESC LIMIT $1`, [limit]
        );
        if (rows.length) {
          return res.json({
            regionPreferred: req.clientRegion,
            regionServed: shard.region,
            fallbackUsed: shard.region !== req.clientRegion,
            results: rows.map((row) => ({ ...row, _region: shard.region })),
          });
        }
      } catch (err) {
        console.warn(`nearby: shard ${shard.region} failed, trying next`, err.message);
      }
    }
    res.json({
      regionPreferred: req.clientRegion,
      regionServed: null,
      fallbackUsed: true,
      results: [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Nearby catalog failed' });
  }
});

/**
 * GET /catalog/search?q=&genre=&year=&language=&sort=popularity|rating|year&page=1
 *
 * SCATTER-GATHER: fan the same SQL out to every shard's replica in
 * parallel (region-preferred order), merge, sort/paginate in the app layer.
 */
router.get('/search', async (req, res) => {
  const { q, genre, year, language, sort = 'popularity', page = 1 } = req.query;
  const limit = 20;
  const offset = (Number(page) - 1) * limit;

  const clauses = [];
  const params = [];
  if (q) { params.push(`%${q}%`); clauses.push(`title ILIKE $${params.length}`); }
  if (genre) { params.push(genre); clauses.push(`$${params.length} = ANY(genres)`); }
  if (year) { params.push(Number(year)); clauses.push(`release_year = $${params.length}`); }
  if (language) { params.push(language); clauses.push(`language = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const sortCol = { popularity: 'popularity', rating: 'rating_avg', year: 'release_year' }[sort] || 'popularity';
  const sql = `SELECT * FROM movies ${where} ORDER BY ${sortCol} DESC LIMIT 100`;

  try {
    const shardConns = movieReadConnsByRegionPriority(req.clientRegion);
    const results = await Promise.allSettled(
      shardConns.map(({ conn, region, index }) =>
        conn.query(sql, params).then((r) => r.rows.map((row) => ({ ...row, _shard: index, _region: region })))
      )
    );

    const merged = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    merged.sort((a, b) => (b[sortCol] || 0) - (a[sortCol] || 0));
    const page_ = merged.slice(offset, offset + limit);

    res.json({
      total: merged.length,
      page: Number(page),
      results: page_,
      clientRegion: req.clientRegion,
      shardsQueried: shardConns.length,
      shardsFailed: results.filter((r) => r.status === 'rejected').length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

/** GET /catalog/trending — scatter-gather with region-preferred shard order. */
router.get('/trending', async (req, res) => {
  try {
    const shardConns = movieReadConnsByRegionPriority(req.clientRegion);
    const results = await Promise.allSettled(
      shardConns.map(({ conn, region }) =>
        conn.query(`SELECT * FROM movies ORDER BY popularity DESC LIMIT 20`)
          .then((r) => r.rows.map((row) => ({ ...row, _region: region })))
      )
    );
    const merged = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
    merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    res.json(merged.slice(0, 20));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load trending' });
  }
});

module.exports = router;
