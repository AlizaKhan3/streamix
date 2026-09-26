const router = require('express').Router();
const { movieReadConn, allMovieReadConns } = require('../db/shardRouter');

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
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

/**
 * GET /catalog/search?q=&genre=&year=&language=&sort=popularity|rating|year&page=1
 *
 * No single shard key applies to a free-text/filter search, so this is a
 * SCATTER-GATHER query: fan the same SQL out to every shard's replica in
 * parallel, merge the rows, sort/paginate in the application layer. This
 * is exactly the "controlled scatter-gather" described in section 6 of
 * the architecture document.
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
    const shardConns = allMovieReadConns();
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
      shardsQueried: shardConns.length,
      shardsFailed: results.filter((r) => r.status === 'rejected').length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

/** GET /catalog/trending — same scatter-gather, fixed popularity sort. */
router.get('/trending', async (req, res) => {
  try {
    const shardConns = allMovieReadConns();
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
