/**
 * Load N synthetic movies across US/EU Postgres shards (hash(content_id) routing).
 * For viva: "sir said add 1 million data" — TMDb API can't supply 1M quickly;
 * this generator proves the DDB can ingest & shard at scale.
 *
 * Usage (Docker movie shards must be up; run from backend/):
 *   TOTAL=1000000 node scripts/seedMillion.js
 *   TOTAL=100000 node scripts/seedMillion.js          # smaller smoke test
 *   SKIP_INDEX_DROP=1 TOTAL=1000000 node scripts/seedMillion.js
 *   INDEX_ES=1 TOTAL=1000000 node scripts/seedMillion.js   # slow; indexes into Elasticsearch too
 *
 * IDs start at START_ID (default 50_000_000) so they don't collide with real TMDb ids.
 */
require('dotenv').config();
const { Pool } = require('pg');
const { shardIndex } = require('../shared/shardHash');

const TOTAL = Number(process.env.TOTAL || 1_000_000);
const START_ID = Number(process.env.START_ID || 50_000_000);
const BATCH = Number(process.env.BATCH || 2000);
const INDEX_ES = process.env.INDEX_ES === '1' || process.env.INDEX_ES === 'true';
const SKIP_INDEX_DROP = process.env.SKIP_INDEX_DROP === '1';

const GENRES = [
  ['Action'], ['Comedy'], ['Drama'], ['Science Fiction'], ['Horror'],
  ['Romance'], ['Thriller'], ['Animation'], ['Action', 'Adventure'],
  ['Drama', 'Romance'], ['Comedy', 'Romance'], ['Science Fiction', 'Action'],
];
const LANGS = ['en', 'en', 'en', 'es', 'fr', 'de', 'hi', 'ja', 'ko'];
const WORDS = [
  'Shadow', 'Quantum', 'Neon', 'Crimson', 'Silent', 'Broken', 'Golden', 'Iron',
  'Midnight', 'Crystal', 'Storm', 'Ocean', 'Desert', 'Forest', 'Sky', 'Echo',
  'Nova', 'Pulse', 'Blade', 'Crown', 'River', 'Thunder', 'Velvet', 'Ash',
];

function pool(host, port) {
  return new Pool({
    host,
    port: Number(port),
    database: process.env.MOVIE_DB_NAME || 'movie_db',
    user: process.env.MOVIE_DB_USER || 'app',
    password: process.env.MOVIE_DB_PASSWORD || 'app_pass',
    max: 4,
    statement_timeout: 0,
    query_timeout: 0,
    connectionTimeoutMillis: 30_000,
  });
}

const shards = [
  {
    region: process.env.MOVIE_SHARD0_REGION || 'US',
    pool: pool(process.env.MOVIE_SHARD0_MASTER_HOST || 'localhost', process.env.MOVIE_SHARD0_MASTER_PORT || 5411),
  },
  {
    region: process.env.MOVIE_SHARD1_REGION || 'EU',
    pool: pool(process.env.MOVIE_SHARD1_MASTER_HOST || 'localhost', process.env.MOVIE_SHARD1_MASTER_PORT || 5421),
  },
];

function titleFor(i) {
  const a = WORDS[i % WORDS.length];
  const b = WORDS[Math.floor(i / WORDS.length) % WORDS.length];
  return `${a} ${b} ${i}`;
}

function rowFor(contentId, shardRegion) {
  const i = Number(contentId) - START_ID;
  return {
    content_id: contentId,
    tmdb_id: contentId,
    title: titleFor(i),
    media_type: 'movie',
    genres: GENRES[i % GENRES.length],
    cast_members: JSON.stringify([{ name: `Actor ${i % 500}`, character: 'Lead' }]),
    director: `Director ${i % 200}`,
    release_year: 1980 + (i % 45),
    language: LANGS[i % LANGS.length],
    overview: `Synthetic catalog row ${contentId} for distributed DB scale demo.`,
    poster_path: null,
    backdrop_path: null,
    trailer_key: null,
    popularity: Number(((i % 10000) / 100).toFixed(2)),
    home_region: shardRegion,
  };
}

async function dropHeavyIndexes(p) {
  await p.query(`
    DROP INDEX IF EXISTS idx_movies_title;
    DROP INDEX IF EXISTS idx_movies_genres;
  `);
}

async function recreateHeavyIndexes(p) {
  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_movies_title ON movies USING gin (to_tsvector('english', title));
    CREATE INDEX IF NOT EXISTS idx_movies_genres ON movies USING gin (genres);
  `);
}

async function insertBatch(p, rows) {
  if (!rows.length) return;
  const params = [];
  const values = [];
  let n = 1;
  for (const r of rows) {
    values.push(
      `($${n++},$${n++},$${n++},$${n++},$${n++},$${n++}::jsonb,$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++},$${n++})`
    );
    params.push(
      r.content_id, r.tmdb_id, r.title, r.media_type, r.genres, r.cast_members,
      r.director, r.release_year, r.language, r.overview, r.poster_path,
      r.backdrop_path, r.trailer_key, r.popularity, r.home_region
    );
  }
  await p.query(
    `INSERT INTO movies (
       content_id, tmdb_id, title, media_type, genres, cast_members, director,
       release_year, language, overview, poster_path, backdrop_path, trailer_key,
       popularity, home_region
     ) VALUES ${values.join(',')}
     ON CONFLICT (content_id) DO NOTHING`,
    params
  );
}

async function main() {
  if (!Number.isFinite(TOTAL) || TOTAL <= 0) throw new Error('TOTAL must be > 0');
  console.log(`[seedMillion] TOTAL=${TOTAL} START_ID=${START_ID} BATCH=${BATCH} INDEX_ES=${INDEX_ES}`);
  console.log('[seedMillion] routing with hash(content_id) % 2 → US/EU shards');

  for (const s of shards) {
    await s.pool.query('SELECT 1');
    console.log(`[seedMillion] connected ${s.region}`);
  }

  if (!SKIP_INDEX_DROP) {
    console.log('[seedMillion] dropping GIN indexes for faster load…');
    for (const s of shards) await dropHeavyIndexes(s.pool);
  }

  const buckets = shards.map(() => []);
  let inserted = 0;
  const t0 = Date.now();

  async function flush(force = false) {
    const jobs = [];
    for (let si = 0; si < shards.length; si++) {
      if (buckets[si].length >= BATCH || (force && buckets[si].length)) {
        const chunk = buckets[si];
        buckets[si] = [];
        jobs.push(
          insertBatch(shards[si].pool, chunk).then(() => {
            inserted += chunk.length;
          })
        );
      }
    }
    if (jobs.length) await Promise.all(jobs);
  }

  for (let i = 0; i < TOTAL; i++) {
    const contentId = START_ID + i;
    const si = shardIndex(contentId, shards.length);
    buckets[si].push(rowFor(contentId, shards[si].region));
    if (buckets.some((b) => b.length >= BATCH)) {
      await flush(false);
      if (inserted > 0 && inserted % (BATCH * 25) < BATCH * 2) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const rate = (inserted / ((Date.now() - t0) / 1000)).toFixed(0);
        console.log(`[seedMillion] progress ${inserted}/${TOTAL} (${elapsed}s, ~${rate} rows/s)`);
      }
    }
  }
  await flush(true);

  console.log('[seedMillion] recreating GIN indexes…');
  for (const s of shards) await recreateHeavyIndexes(s.pool);

  const counts = [];
  for (const s of shards) {
    const { rows } = await s.pool.query('SELECT COUNT(*)::bigint AS c FROM movies');
    counts.push({ region: s.region, count: Number(rows[0].c) });
  }
  const sum = counts.reduce((a, b) => a + b.count, 0);
  console.log('[seedMillion] per-shard counts:', counts);
  console.log(`[seedMillion] TOTAL movies now: ${sum}`);
  console.log(`[seedMillion] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (INDEX_ES) {
    console.log('[seedMillion] INDEX_ES=1 — bulk indexing (this is slow)…');
    const { indexMovie, ensureIndex } = require('../shared/elasticsearch');
    await ensureIndex();
    // Index a sample only unless ES_FULL=1 (full 1M can take very long)
    const esLimit = process.env.ES_FULL === '1' ? TOTAL : Math.min(TOTAL, Number(process.env.ES_SAMPLE || 20000));
    for (let i = 0; i < esLimit; i++) {
      const contentId = START_ID + i;
      const si = shardIndex(contentId, shards.length);
      const r = rowFor(contentId, shards[si].region);
      await indexMovie({
        ...r,
        cast_members: JSON.parse(r.cast_members),
      }).catch(() => {});
      if (i > 0 && i % 2000 === 0) console.log(`[seedMillion] ES indexed ${i}/${esLimit}`);
    }
    console.log(`[seedMillion] ES sample indexed: ${esLimit}`);
  } else {
    console.log('[seedMillion] skipped Elasticsearch (set INDEX_ES=1 to index a sample)');
  }

  await Promise.all(shards.map((s) => s.pool.end()));
}

main().catch((err) => {
  console.error('[seedMillion] FAILED', err);
  process.exit(1);
});
