const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { movieWriteConn } = require('../db/shardRouter');
const tmdb = require('../services/tmdbService');

/**
 * POST /admin/movies/sync  { query: "Inception" }  or  { tmdbId, mediaType }
 * Pulls from TMDb, then WRITES to the shard chosen by hash(content_id) —
 * writes always go to a shard's PRIMARY, never the replica.
 */
router.post('/movies/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { tmdbId, mediaType = 'movie', region = 'US' } = req.body;
    if (!tmdbId) return res.status(400).json({ error: 'tmdbId is required' });

    const details = await tmdb.getDetails(tmdbId, mediaType);
    const row = tmdb.toMovieRow(details, mediaType, region);

    const conn = movieWriteConn(row.content_id); // routed by shard key
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

/** POST /admin/movies/bulk-discover  { genreId, year, language, region } */
router.post('/movies/bulk-discover', requireAuth, requireAdmin, async (req, res) => {
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

module.exports = router;
