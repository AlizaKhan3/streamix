require('dotenv').config();
process.env.SERVICE_NAME = 'catalog-service';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const { resolveRegion } = require('../../shared/region');
const { requireAuth, requireAdmin } = require('../../shared/auth');
const { cacheGet, cacheSet, pingRedis } = require('../../shared/redis');
const {
  movieReadConn, movieReadConnsByRegionPriority, movieWriteConn,
  healthMovieShards, queryWithRetry,
} = require('../../shared/movieShardRouter');
const { searchMovies, indexMovie, pingElasticsearch, ensureIndex } = require('../../shared/elasticsearch');
const { validateSearchQuery, validatePositiveInt } = require('../../shared/validators');
const { asyncHandler, errorHandler, requireInternal, requestLogger } = require('../../shared/middleware');
const { log } = require('../../shared/logger');
const tmdb = require('../../src/services/tmdbService');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '256kb' }));
app.use(requestLogger('catalog-service'));

// Warm ES index mapping on boot (non-blocking)
ensureIndex().catch(() => {});

app.get('/health', asyncHandler(async (_req, res) => {
  const [shards, redis, es] = await Promise.all([
    healthMovieShards(),
    pingRedis(),
    pingElasticsearch(),
  ]);
  const shardsOk = shards.every((s) => s.status === 'ok');
  const ok = shardsOk && redis.status === 'ok';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    service: 'catalog-service',
    shards,
    redis,
    elasticsearch: es,
  });
}));

app.use('/catalog', resolveRegion);

app.get('/catalog/movie/:id', asyncHandler(async (req, res) => {
  const contentId = validatePositiveInt(req.params.id, 'id');
  if (!contentId.ok) return res.status(400).json({ error: contentId.error });
  const { rows } = await queryWithRetry(
    movieReadConn(contentId.value),
    `SELECT * FROM movies WHERE content_id = $1`,
    [contentId.value]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ ...rows[0], _clientRegion: req.clientRegion });
}));

app.get('/catalog/nearby', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const ordered = movieReadConnsByRegionPriority(req.clientRegion);
  for (const shard of ordered) {
    try {
      const { rows } = await queryWithRetry(
        shard.conn,
        `SELECT * FROM movies ORDER BY popularity DESC LIMIT $1`,
        [limit]
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
      log.warn('nearby_shard_failed', { region: shard.region, message: err.message });
    }
  }
  res.json({ regionPreferred: req.clientRegion, regionServed: null, fallbackUsed: true, results: [] });
}));

/**
 * Search: Elasticsearch first (fuzziness + multi-field), then Postgres FTS
 * (uses existing GIN to_tsvector index), then ILIKE scatter-gather last resort.
 */
async function searchPostgresFts({ q, genre, year, language, sort, page }, clientRegion) {
  const limit = 20;
  const offset = (page - 1) * limit;
  const clauses = [];
  const params = [];

  if (q) {
    params.push(q);
    const p = params.length;
    clauses.push(
      `(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(director,'') || ' ' || coalesce(overview,'')) @@ plainto_tsquery('english', $${p})
        OR title ILIKE '%' || $${p} || '%'
        OR COALESCE(director,'') ILIKE '%' || $${p} || '%'
        OR cast_members::text ILIKE '%' || $${p} || '%')`
    );
  }
  if (genre) {
    const genreAliases = { 'Sci-Fi': 'Science Fiction', SciFi: 'Science Fiction', SF: 'Science Fiction' };
    const g = genreAliases[String(genre)] || String(genre);
    params.push(g);
    clauses.push(`$${params.length} = ANY(genres)`);
  }
  if (year) { params.push(year); clauses.push(`release_year = $${params.length}`); }
  if (language) { params.push(language); clauses.push(`language = $${params.length}`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const sortCol = sort;
  const sql = `SELECT * FROM movies ${where} ORDER BY ${sortCol} DESC LIMIT 100`;

  const shardConns = movieReadConnsByRegionPriority(clientRegion);
  const results = await Promise.allSettled(
    shardConns.map(({ conn, region, index }) =>
      queryWithRetry(conn, sql, params).then((r) =>
        r.rows.map((row) => ({ ...row, _shard: index, _region: region }))
      )
    )
  );
  const merged = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  merged.sort((a, b) => (b[sortCol] || 0) - (a[sortCol] || 0));
  return {
    total: merged.length,
    page,
    results: merged.slice(offset, offset + limit),
    clientRegion,
    shardsQueried: shardConns.length,
    shardsFailed: results.filter((r) => r.status === 'rejected').length,
    engine: q ? 'postgres-fts' : 'postgres-scatter',
  };
}

app.get('/catalog/search', asyncHandler(async (req, res) => {
  const filters = validateSearchQuery(req.query);
  const cacheKey = `catalog:search:${crypto.createHash('md5').update(JSON.stringify(filters) + (req.clientRegion || '')).digest('hex')}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json({ ...cached, _cache: 'HIT' });

  const genreAliases = { 'Sci-Fi': 'Science Fiction', SciFi: 'Science Fiction', SF: 'Science Fiction' };
  const genre = filters.genre ? (genreAliases[filters.genre] || filters.genre) : null;

  // Prefer Elasticsearch when filters/query present
  let body = null;
  if (filters.q || genre || filters.year || filters.language) {
    const es = await searchMovies({
      q: filters.q,
      genre,
      year: filters.year,
      language: filters.language,
      sort: filters.sort,
      page: filters.page,
      size: 20,
    });
    if (es) {
      body = {
        ...es,
        clientRegion: req.clientRegion,
        _cache: 'MISS',
      };
    }
  }

  if (!body) {
    body = {
      ...(await searchPostgresFts(filters, req.clientRegion)),
      _cache: 'MISS',
    };
  }

  await cacheSet(cacheKey, { ...body, _cache: undefined }, 60);
  res.json(body);
}));

app.get('/catalog/trending', asyncHandler(async (req, res) => {
  const cacheKey = `catalog:trending:${req.clientRegion || 'US'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const shardConns = movieReadConnsByRegionPriority(req.clientRegion);
  const results = await Promise.allSettled(
    shardConns.map(({ conn, region }) =>
      queryWithRetry(conn, `SELECT * FROM movies ORDER BY popularity DESC LIMIT 20`)
        .then((r) => r.rows.map((row) => ({ ...row, _region: region })))
    )
  );
  const merged = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  merged.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const body = merged.slice(0, 20);
  await cacheSet(cacheKey, body, 60);
  res.json(body);
}));

/** Internal: update rating aggregates after a review. */
app.post('/catalog/internal/rating', requireInternal, express.json(), asyncHandler(async (req, res) => {
  const movieId = validatePositiveInt(req.body.movieId, 'movieId');
  if (!movieId.ok) return res.status(400).json({ error: movieId.error });
  const avg = Number(req.body.avg);
  const count = Number(req.body.count);
  if (!Number.isFinite(avg) || !Number.isFinite(count) || count < 0) {
    return res.status(400).json({ error: 'avg and count must be valid numbers' });
  }
  await movieWriteConn(movieId.value).query(
    `UPDATE movies SET rating_avg = $1, rating_count = $2 WHERE content_id = $3`,
    [avg, count, movieId.value]
  );
  res.json({ ok: true });
}));

app.post('/admin/movies/sync', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { tmdbId, mediaType = 'movie', region = 'US' } = req.body;
  const id = validatePositiveInt(tmdbId, 'tmdbId');
  if (!id.ok) return res.status(400).json({ error: id.error });
  if (!['movie', 'tv'].includes(mediaType)) {
    return res.status(400).json({ error: 'mediaType must be movie or tv' });
  }
  if (!['US', 'EU'].includes(region)) {
    return res.status(400).json({ error: 'region must be US or EU' });
  }

  const details = await tmdb.getDetails(id.value, mediaType);
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
  await indexMovie(row);
  res.status(201).json({ synced: row.content_id, shardRegion: region, indexed: true });
}));

app.post('/admin/movies/bulk-discover', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { genreId, year, language, region = 'US' } = req.body;
  if (!['US', 'EU'].includes(region)) {
    return res.status(400).json({ error: 'region must be US or EU' });
  }
  const list = await tmdb.discoverTmdb({ genreId, year, language });
  let synced = 0;
  let indexed = 0;
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
    if (await indexMovie(row)) indexed++;
    synced++;
  }
  res.json({ synced, indexed });
}));

/** Reindex all movies from Postgres shards into Elasticsearch. */
app.post('/admin/movies/reindex', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const shardConns = movieReadConnsByRegionPriority(req.clientRegion || 'US');
  let indexed = 0;
  for (const { conn, region } of shardConns) {
    const { rows } = await conn.query(`SELECT * FROM movies`);
    for (const row of rows) {
      if (await indexMovie({ ...row, home_region: row.home_region || region })) indexed++;
    }
  }
  res.json({ indexed, engine: 'elasticsearch' });
}));

app.use(errorHandler);

const PORT = process.env.CATALOG_SERVICE_PORT || 4002;
app.listen(PORT, () => log.info('listening', { service: 'catalog-service', port: Number(PORT) }));
