// ============================================================
// SEED — loads the sample catalog, demo users, reviews and watchlists.
// Safe to run more than once (existing rows are skipped).
//
//   inside docker :  docker compose exec api-pk node scripts/seed.js
//   from the host :  npm run seed
// ============================================================
require('../src/config/env');
const {
  REGION_CODES, fragmentIndexFor, movieGroup, directoryGroup, closeAll,
} = require('../src/config/topology');
const { transaction, write } = require('../src/db/router');
const { insertMovie } = require('../src/services/movieRows');
const directory = require('../src/services/directory');
const users = require('../src/services/users');
const reviews = require('../src/services/reviews');
const watchlist = require('../src/services/watchlist');
const movies = require('../src/services/movies');
const data = require('./seedData');

async function waitForCluster() {
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      await write(directoryGroup(), (c) => c.query('SELECT 1'));
      for (const r of REGION_CODES) {
        await write(movieGroup(r, 0), (c) => c.query('SELECT 1'));
        await write(movieGroup(r, 1), (c) => c.query('SELECT 1'));
      }
      return;
    } catch {
      console.log(`waiting for the database cluster... (${attempt})`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('Cluster did not become reachable — is `docker compose up -d` running?');
}

async function seedMovies() {
  let inserted = 0;
  const createdAt = new Date('2026-01-01T00:00:00Z');
  for (const m of data.movies) {
    const row = {
      content_id: m.content_id,
      tmdb_id: m.content_id < 9000000 ? m.content_id : null,
      title: m.title,
      media_type: m.media_type || 'movie',
      genres: m.genres,
      cast_members: m.cast,
      director: m.director,
      release_year: m.release_year,
      language: m.language,
      overview: m.overview,
      popularity: m.popularity,
      license_regions: [...m.license].sort(),
      origin_region: m.origin,
      vclock: { [m.origin]: 1 },
      last_writer_region: m.origin,
      created_at: createdAt,
      updated_at: createdAt,
    };
    // Geo-partitioning: the row is physically stored only in licensed regions,
    // and inside each region only on the fragment its content_id range maps to.
    for (const region of m.license) {
      const added = await transaction(movieGroup(region, fragmentIndexFor(m.content_id)), async (c) => {
        const exists = await c.query('SELECT 1 FROM movies WHERE content_id = $1', [m.content_id]);
        if (exists.rowCount) return false;
        await insertMovie(c, row);
        return true;
      });
      if (added) inserted++;
    }
    await directory.upsertCatalog(row);
  }
  await write(directoryGroup(), (c) =>
    c.query("SELECT setval('content_id_seq', GREATEST((SELECT last_value FROM content_id_seq), 9000100))")
  );
  console.log(`movies: ${inserted} regional copies inserted (${data.movies.length} titles)`);
}

async function seedUsers() {
  const byEmail = {};
  for (const u of data.users) {
    let entry = await directory.findUser(u.email);
    if (!entry) {
      await users.register({ region: u.region, email: u.email, password: u.password, fullName: u.fullName });
      entry = await directory.findUser(u.email);
      console.log(`user: created ${u.email} (${u.region})`);
    }
    const token = { sub: entry.user_id, email: u.email, role: u.role, home_region: entry.home_region, name: u.fullName };
    if (u.role === 'admin') await users.updateUser({ region: entry.home_region, userId: entry.user_id, role: 'admin' });
    await users.updateProfile({ user: token, patch: { preferences: { favoriteGenres: u.favoriteGenres, language: null } } });
    byEmail[u.email] = token;
  }
  return byEmail;
}

async function seedReviews(byEmail) {
  let added = 0;
  for (const [email, movieId, rating, comment] of data.reviews) {
    const movie = data.movies.find((m) => m.content_id === movieId);
    try {
      await reviews.submit({ region: movie.origin, user: byEmail[email], movieId, rating, comment, protocol: '2pc' });
      added++;
    } catch (err) {
      if (err.status !== 409) throw err;
    }
  }
  console.log(`reviews: ${added} added via Two-Phase Commit`);
}

async function seedWatchlists(byEmail) {
  for (const [email, contentId, status] of data.watchlist) {
    const user = byEmail[email];
    const movie = data.movies.find((m) => m.content_id === contentId);
    const region = movie.license.includes(user.home_region) ? user.home_region : movie.license[0];
    const stored = await movies.getMovie(region, contentId);
    await watchlist.add({
      user,
      movie: { content_id: contentId, title: stored.title, poster_path: stored.poster_path, genres: stored.genres },
      status,
    });
  }
  console.log(`watchlist: ${data.watchlist.length} items`);
}

(async () => {
  await waitForCluster();
  await seedMovies();
  const byEmail = await seedUsers();
  await seedReviews(byEmail);
  await seedWatchlists(byEmail);
  console.log('\nDone. Demo accounts:');
  data.users.forEach((u) => console.log(`  ${u.role.padEnd(5)} ${u.region}  ${u.email} / ${u.password}`));
  console.log('\nRating aggregates of globally-licensed titles reach the other region through the');
  console.log('replication outbox as soon as both gateways (api-pk, api-us) are running.');
  await closeAll();
})().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await closeAll();
  process.exit(1);
});
