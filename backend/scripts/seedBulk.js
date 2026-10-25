/**
 * Bulk seeder for viva demos — many users + many movies (+ sample reviews/watchlists).
 *
 * Usage (from backend/, DBs must be up on localhost ports from .env):
 *   node scripts/seedBulk.js
 *   USERS=80 MOVIE_PAGES=5 node scripts/seedBulk.js
 *
 * Default password for all seeded users: Password1
 * Admin: admin@streamix.io / Password1
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { userWriteConn, movieWriteConn, allMovieReadConns } = require('../shared/movieShardRouter');
const { watchlistCollection, reviewCollection } = require('../shared/mongoShards');
const { indexMovie } = require('../shared/elasticsearch');
const tmdb = require('../src/services/tmdbService');

const USERS = Number(process.env.USERS || 60);
const MOVIE_PAGES = Number(process.env.MOVIE_PAGES || 4); // pages × genres
const PASSWORD = process.env.SEED_PASSWORD || 'Password1';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10); // faster for seed

const FEATURED_IDS = [
  27205, 157336, 155, 550, 603, 680, 13, 278, 238, 424,
  122, 11, 1891, 1892, 1893, 120, 121, 497, 807, 496243,
  299536, 299534, 118340, 24428, 99861, 10138, 1726, 68721, 76341, 335984,
];

const DISCOVER = [
  { genreId: 28, region: 'US' },  // Action
  { genreId: 35, region: 'EU' },  // Comedy
  { genreId: 18, region: 'US' },  // Drama
  { genreId: 878, region: 'EU' }, // Sci-Fi
  { genreId: 27, region: 'US' },  // Horror
  { genreId: 10749, region: 'EU' }, // Romance
  { genreId: 53, region: 'US' },  // Thriller
  { genreId: 16, region: 'EU' },  // Animation
];

const FIRST = ['Aisha', 'Bilal', 'Chen', 'Diego', 'Elena', 'Farah', 'Grace', 'Hassan', 'Ivy', 'Jamal', 'Kira', 'Leo', 'Maya', 'Noah', 'Omar', 'Priya', 'Quinn', 'Ravi', 'Sara', 'Tariq', 'Uma', 'Vera', 'Wade', 'Xena', 'Yara', 'Zain'];
const LAST = ['Khan', 'Ali', 'Chen', 'Garcia', 'Nguyen', 'Patel', 'Smith', 'Johnson', 'Brown', 'Lee', 'Kim', 'Singh', 'Ahmed', 'Martinez', 'Wilson'];

async function upsertMovie(row) {
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
  await indexMovie(row).catch(() => false);
}

async function seedMovies() {
  const seen = new Set();
  let synced = 0;

  console.log('[seed] featured movies…');
  for (const id of FEATURED_IDS) {
    try {
      const details = await tmdb.getDetails(id, 'movie');
      const row = tmdb.toMovieRow(details, 'movie', id % 2 === 0 ? 'US' : 'EU');
      if (seen.has(row.content_id)) continue;
      seen.add(row.content_id);
      await upsertMovie(row);
      synced++;
      process.stdout.write(`\r  movies: ${synced}`);
    } catch (err) {
      console.warn(`\n  skip featured ${id}:`, err.message);
    }
  }

  console.log('\n[seed] discover pages…');
  for (const { genreId, region } of DISCOVER) {
    for (let page = 1; page <= MOVIE_PAGES; page++) {
      try {
        const list = await tmdb.discoverTmdb({ genreId, page });
        for (const item of list) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          try {
            const details = await tmdb.getDetails(item.id, 'movie');
            const row = tmdb.toMovieRow(details, 'movie', region);
            await upsertMovie(row);
            synced++;
            process.stdout.write(`\r  movies: ${synced}`);
          } catch (err) {
            console.warn(`\n  skip ${item.id}:`, err.message);
          }
        }
      } catch (err) {
        console.warn(`\n  discover genre ${genreId} page ${page}:`, err.message);
      }
    }
  }
  console.log(`\n[seed] movies done: ${synced}`);
  return synced;
}

async function seedUsers() {
  const hash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  const write = userWriteConn();
  const created = [];

  // Admin first
  try {
    const client = await write.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO users_auth (email, password_hash, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (email) DO UPDATE SET role = 'admin'
         RETURNING user_id, email, role`,
        ['admin@streamix.io', hash]
      );
      const u = r.rows[0];
      await client.query(
        `INSERT INTO users_profile (user_id, full_name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name`,
        [u.user_id, 'Streamix Admin']
      );
      await client.query('COMMIT');
      created.push(u);
      console.log('[seed] admin@streamix.io / Password1 (admin)');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[seed] admin:', err.message);
  }

  console.log(`[seed] creating ~${USERS} users…`);
  for (let i = 1; i <= USERS; i++) {
    const email = `user${i}@streamix.io`;
    const fullName = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const client = await write.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO users_auth (email, password_hash, role)
         VALUES ($1, $2, 'user')
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING user_id, email, role`,
        [email, hash]
      );
      const u = r.rows[0];
      await client.query(
        `INSERT INTO users_profile (user_id, full_name) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name`,
        [u.user_id, fullName]
      );
      await client.query('COMMIT');
      created.push(u);
      if (i % 10 === 0) process.stdout.write(`\r  users: ${i}/${USERS}`);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      console.warn(`\n  user ${email}:`, err.message);
    } finally {
      client.release();
    }
  }
  console.log(`\n[seed] users done: ${created.length}`);
  return created;
}

async function loadMovieIds() {
  const conns = allMovieReadConns();
  const results = await Promise.allSettled(
    conns.map(({ conn }) => conn.query(`SELECT content_id FROM movies ORDER BY popularity DESC LIMIT 200`))
  );
  const ids = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value.rows.map((row) => Number(row.content_id)));
  return [...new Set(ids)];
}

async function seedEngagement(users, movieIds) {
  if (!users.length || !movieIds.length) return;
  console.log('[seed] watchlists + reviews…');
  let wl = 0;
  let rv = 0;
  const sample = users.slice(0, Math.min(users.length, 40));
  for (const u of sample) {
    const picks = movieIds.sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 6));
    for (const contentId of picks.slice(0, 4)) {
      try {
        const { collection } = await watchlistCollection(u.user_id);
        await collection.updateOne(
          { user_id: u.user_id, content_id: contentId },
          { $setOnInsert: { user_id: u.user_id, content_id: contentId, added_at: new Date() } },
          { upsert: true }
        );
        wl++;
      } catch (_) { /* ignore */ }
    }
    for (const movieId of picks.slice(0, 3)) {
      try {
        const { collection } = await reviewCollection(movieId);
        const existing = await collection.findOne({ user_id: u.user_id, movie_id: movieId });
        if (existing) continue;
        await collection.insertOne({
          user_id: u.user_id,
          movie_id: movieId,
          rating: 1 + Math.floor(Math.random() * 5),
          comment: 'Seeded review for demo',
          moderation_status: 'approved',
          created_at: new Date(),
        });
        rv++;
      } catch (_) { /* ignore */ }
    }
  }
  console.log(`[seed] watchlist rows≈${wl}, reviews≈${rv}`);
}

async function main() {
  if (!process.env.TMDB_API_KEY || process.env.TMDB_API_KEY === 'your_tmdb_v3_api_key') {
    throw new Error('Set TMDB_API_KEY in backend/.env');
  }
  console.log(`Bulk seed: USERS=${USERS} MOVIE_PAGES=${MOVIE_PAGES}`);
  const movieCount = await seedMovies();
  const users = await seedUsers();
  const movieIds = await loadMovieIds();
  await seedEngagement(users, movieIds);
  console.log('\n=== DONE ===');
  console.log(`Movies synced this run: ${movieCount}`);
  console.log(`Users available: ${users.length} (password: ${PASSWORD})`);
  console.log('Login admin: admin@streamix.io / Password1');
  console.log('Login user:  user1@streamix.io / Password1');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
