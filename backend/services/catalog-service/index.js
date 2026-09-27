require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { resolveRegion } = require('../../shared/region');
const { requireAuth, requireAdmin } = require('../../shared/auth');
const { cacheGet, cacheSet } = require('../../shared/redis');
const {
  movieReadConn, allMovieReadConns, movieReadConnsByRegionPriority, movieWriteConn,
} = require('../../shared/movieShardRouter');
const tmdb = require('../../src/services/tmdbService');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'catalog-service' }));

app.use('/catalog', resolveRegion);

app.get('/catalog/movie/:id', async (req, res) => {
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

app.get('/catalog/nearby', async (req, res) => {
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
        console.warn(`nearby: shard ${shard.region} failed`, err.message);
      }
    }
    res.json({ regionPreferred: req.clientRegion, regionServed: null, fallbackUsed: true, results: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Nearby catalog failed' });
  }
});

app.get('/catalog/search', async (req, res) => {
  const { q, genre, year, language, sort = 'popularity', page = 1 } = req.query;
  const cacheKey = `catalog:search:${crypto.createHash('md5').update(JSON.stringify(req.query) + (req.clientRegion || '')).digest('hex')}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json({ ...cached, _cache: 'HIT' });

  const limit = 20;
  const offset = (Number(page) - 1) * limit;
  const clauses = [];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    const p = params.length;
    // Title + director + cast JSON text (placeholder promised actors/directors)
    clauses.push(`(title ILIKE $${p} OR COALESCE(director,'') ILIKE $${p} OR cast_members::text ILIKE $${p})`);
  }
  if (genre) {
    // Accept common aliases (Sci-Fi → Science Fiction)
    const genreAliases = {
      'Sci-Fi': 'Science Fiction',
      SciFi: 'Science Fiction',
      SF: 'Science Fiction',
    };
    const g = genreAliases[String(genre)] || String(genre);
    params.push(g);
    clauses.push(`$${params.length} = ANY(genres)`);
  }
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
    const merged = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
    merged.sort((a, b) => (b[sortCol] || 0) - (a[sortCol] || 0));
    const body = {
      total: merged.length,
      page: Number(page),
      results: merged.slice(offset, offset + limit),
      clientRegion: req.clientRegion,
      shardsQueried: shardConns.length,
      shardsFailed: results.filter((r) => r.status === 'rejected').length,
      _cache: 'MISS',
    };
    await cacheSet(cacheKey, { ...body, _cache: undefined }, 60);
    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/catalog/trending', async (req, res) => {
  const cacheKey = `catalog:trending:${req.clientRegion || 'US'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

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
    const body = merged.slice(0, 20);
    await cacheSet(cacheKey, body, 60);
    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load trending' });
  }
});

/** Internal: update rating aggregates after a review (called by review-service or locally). */
app.post('/catalog/internal/rating', express.json(), async (req, res) => {
  const { movieId, avg, count } = req.body;
  if (!movieId) return res.status(400).json({ error: 'movieId required' });
  try {
    await movieWriteConn(movieId).query(
      `UPDATE movies SET rating_avg = $1, rating_count = $2 WHERE content_id = $3`,
      [avg, count, movieId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'rating update failed' });
  }
});

app.post('/admin/movies/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { tmdbId, mediaType = 'movie', region = 'US' } = req.body;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId is required' });
    const details = await tmdb.getDetails(tmdbId, mediaType);
    const row = tmdb.toMovieRow(details, mediaType, region);
    const conn = movieWriteConn(row.content_id);
    await conn.query(
      `INSERT INTO movies (content_id, tmdb_id, title, media_type, genres, cast_members, director,
                            release_year, language, overview, poster_path, backdrop_path, trailer_key,
                            popularity, home_region)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (content_id) DO UPDATE SET
         title = EXCLUDED.title, genres = EXCLUDED.genres, cast_members = EXCLUDED.cast_members,
         director = EXCLUDED.director, overview = EXCLUDED.overview, poster_path = EXCLUDED.poster_path,
         backdrop_path = EXCLUDED.backdrop_path, trailer_key = EXCLUDED.trailer_key,
         popularity = EXCLUDED.popularity, updated_at = now()`,
      [row.content_id, row.tmdb_id, row.title, row.media_type, row.genres, row.cast_members, row.director,
       row.release_year, row.language, row.overview, row.poster_path, row.backdrop_path, row.trailer_key,
       row.popularity, row.home_region]
    );
    res.status(201).json({ synced: row.content_id, shardRegion: region });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

app.post('/admin/movies/bulk-discover', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { genreId, year, language, region = 'US' } = req.body;
    const list = await tmdb.discoverTmdb({ genreId, year, language });
    let synced = 0;
    for (const item of list) {
      const details = await tmdb.getDetails(item.id, 'movie');
      const row = tmdb.toMovieRow(details, 'movie', region);
      await movieWriteConn(row.content_id).query(
        `INSERT INTO movies (content_id, tmdb_id, title, media_type, genres, cast_members, director,
                              release_year, language, overview, poster_path, backdrop_path, trailer_key,
                              popularity, home_region)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (content_id) DO NOTHING`,
        [row.content_id, row.tmdb_id, row.title, row.media_type, row.genres, row.cast_members, row.director,
         row.release_year, row.language, row.overview, row.poster_path, row.backdrop_path, row.trailer_key,
         row.popularity, row.home_region]
      );
      synced++;
    }
    res.json({ synced });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bulk discover failed' });
  }
});

const PORT = process.env.CATALOG_SERVICE_PORT || 4002;
app.listen(PORT, () => console.log(`[catalog-service] :${PORT}`));
