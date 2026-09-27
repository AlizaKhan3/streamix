/**
 * One-shot catalog seeder — pulls popular titles from TMDb into the sharded movie DBs.
 * Run from backend/:  node scripts/seedMovies.js
 * (Uses .env localhost ports; Postgres containers must be up.)
 */
require('dotenv').config();
const { movieWriteConn } = require('../src/db/shardRouter');
const tmdb = require('../src/services/tmdbService');

const FEATURED_IDS = [27205, 157336, 155, 550, 603, 680, 13, 278, 238, 424]; // Inception, Interstellar, Dark Knight, Fight Club, Matrix, Pulp Fiction, Forrest Gump, Shawshank, Godfather, Schindler's List
const DISCOVER = [
  { genreId: 28, region: 'US' }, // Action
  { genreId: 35, region: 'EU' }, // Comedy
  { genreId: 18, region: 'US' }, // Drama
  { genreId: 878, region: 'EU' }, // Sci-Fi
];

async function upsert(row) {
  await movieWriteConn(row.content_id).query(
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
}

async function main() {
  let synced = 0;

  for (const id of FEATURED_IDS) {
    const details = await tmdb.getDetails(id, 'movie');
    const row = tmdb.toMovieRow(details, 'movie', 'US');
    await upsert(row);
    console.log('synced', row.title);
    synced++;
  }

  for (const { genreId, region } of DISCOVER) {
    const list = await tmdb.discoverTmdb({ genreId });
    for (const item of list.slice(0, 12)) {
      const details = await tmdb.getDetails(item.id, 'movie');
      const row = tmdb.toMovieRow(details, 'movie', region);
      await upsert(row);
      synced++;
      console.log('synced', row.title, `(${region})`);
    }
  }

  console.log(`Done. Synced ${synced} movies.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
