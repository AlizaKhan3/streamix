// ============================================================
// MOVIE CATALOG MODULE
//
// Reads  : served from the region's own fragments, replica first (AP).
//          Queries with no fragment key (search, trending) are
//          SCATTER-GATHER: the same SQL runs on every fragment in parallel,
//          results are merged/sorted/paginated in the gateway. A fragment
//          that is down only removes its rows — the rest still answer.
// Writes : routed to the one fragment owning content_id (range predicate),
//          on its primary, bumping the vector clock and queueing
//          geo-replication in the same local transaction.
// ============================================================
const { MOVIE_FRAGMENTS, REGION_CODES, fragmentIndexFor, movieGroup } = require('../config/topology');
const { read, transaction } = require('../db/router');
const vclock = require('./vclock');
const directory = require('./directory');
const replication = require('./replication');
const { insertMovie, toPublic, dbValue } = require('./movieRows');
const { httpError } = require('../utils/httpError');

// ---------------- scatter-gather ----------------
async function scatter(region, sql, params = []) {
  const settled = await Promise.allSettled(
    MOVIE_FRAGMENTS.map((f) =>
      read(movieGroup(region, f.index), async (pool, meta) => {
        const { rows } = await pool.query(sql, params);
        const servedBy = { region, fragment: f.label, node: meta.node, role: meta.role };
        return { rows: rows.map((r) => (r.content_id !== undefined ? toPublic(r, servedBy) : r)), servedBy };
      })
    )
  );
  return {
    rows: settled.filter((s) => s.status === 'fulfilled').flatMap((s) => s.value.rows),
    fragments: settled.map((s, i) =>
      s.status === 'fulfilled'
        ? { ...s.value.servedBy, ok: true, rows: s.value.rows.length }
        : { region, fragment: MOVIE_FRAGMENTS[i].label, ok: false, error: s.reason.message }
    ),
  };
}

// ---------------- reads ----------------
async function getMovie(region, contentId) {
  const frag = MOVIE_FRAGMENTS[fragmentIndexFor(contentId)];
  return read(movieGroup(region, frag.index), async (pool, meta) => {
    const { rows } = await pool.query('SELECT * FROM movies WHERE content_id = $1', [contentId]);
    return rows[0] ? toPublic(rows[0], { region, fragment: frag.label, node: meta.node, role: meta.role }) : null;
  });
}

async function getMoviesByIds(region, ids) {
  const clean = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!clean.length) return [];
  const byFragment = new Map();
  for (const id of clean) {
    const idx = fragmentIndexFor(id);
    if (!byFragment.has(idx)) byFragment.set(idx, []);
    byFragment.get(idx).push(id);
  }
  const settled = await Promise.allSettled(
    [...byFragment.entries()].map(([idx, fragIds]) =>
      read(movieGroup(region, idx), async (pool, meta) => {
        const { rows } = await pool.query('SELECT * FROM movies WHERE content_id = ANY($1::bigint[])', [fragIds]);
        const servedBy = { region, fragment: MOVIE_FRAGMENTS[idx].label, node: meta.node, role: meta.role };
        return rows.map((r) => toPublic(r, servedBy));
      })
    )
  );
  return settled.filter((s) => s.status === 'fulfilled').flatMap((s) => s.value);
}

const SORTS = {
  popularity: { col: 'popularity', dir: 'DESC' },
  rating: { col: 'rating_avg', dir: 'DESC' },
  year: { col: 'release_year', dir: 'DESC' },
  oldest: { col: 'release_year', dir: 'ASC' },
  title: { col: 'title', dir: 'ASC' },
};

function compareBy(sort) {
  const { col, dir } = SORTS[sort] || SORTS.popularity;
  const sign = dir === 'ASC' ? 1 : -1;
  return (a, b) => {
    const x = a[col];
    const y = b[col];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'string') return sign * x.localeCompare(y);
    return sign * (x - y) || b.popularity - a.popularity;
  };
}

function matchedBy(movie, q) {
  if (!q) return undefined;
  const needle = q.toLowerCase();
  const fields = [];
  if (movie.title?.toLowerCase().includes(needle)) fields.push('title');
  if (movie.director?.toLowerCase().includes(needle)) fields.push('director');
  if ((movie.cast_members || []).some((c) => c.name?.toLowerCase().includes(needle))) fields.push('actor');
  return fields;
}

/** Search by title / actor / director, filter by genre / year / language, sort, paginate. */
async function search(region, { q, genre, year, language, sort = 'popularity', page = 1, limit = 20 } = {}) {
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(50, Math.max(1, Number(limit) || 20));
  const clauses = [];
  const params = [];
  const add = (build, value) => {
    params.push(value);
    clauses.push(build(`$${params.length}`));
  };
  if (q) {
    add(
      (p) => `(title ILIKE ${p} OR director ILIKE ${p}
               OR EXISTS (SELECT 1 FROM jsonb_array_elements(cast_members) cm WHERE cm->>'name' ILIKE ${p}))`,
      `%${q}%`
    );
  }
  if (genre) add((p) => `${p} = ANY(genres)`, genre);
  if (year) add((p) => `release_year = ${p}`, Number(year));
  if (language) add((p) => `language = ${p}`, language);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { col, dir } = SORTS[sort] || SORTS.popularity;

  // Each fragment returns its own top (page × limit) rows, which is enough
  // for the merged global order to be exact up to this page.
  const perFragment = Math.min(500, page * limit);
  const [data, counts] = await Promise.all([
    scatter(region, `SELECT * FROM movies ${where} ORDER BY ${col} ${dir} NULLS LAST, content_id LIMIT ${perFragment}`, params),
    scatter(region, `SELECT count(*)::int AS n FROM movies ${where}`, params),
  ]);

  const merged = data.rows.sort(compareBy(sort));
  const results = merged.slice((page - 1) * limit, page * limit).map((m) => ({ ...m, _matchedBy: matchedBy(m, q) }));
  return {
    results,
    total: counts.rows.reduce((sum, r) => sum + r.n, 0),
    page,
    pageSize: limit,
    distributed: {
      strategy: 'scatter-gather',
      region,
      fragmentsQueried: data.fragments.length,
      fragmentsFailed: data.fragments.filter((f) => !f.ok).length,
      fragments: data.fragments,
    },
  };
}

async function trending(region, limit = 20) {
  const { rows, fragments } = await scatter(region, 'SELECT * FROM movies ORDER BY popularity DESC LIMIT $1', [limit]);
  return { results: rows.sort(compareBy('popularity')).slice(0, limit), fragments };
}

async function filters(region) {
  const [genres, languages, years] = await Promise.all([
    scatter(region, 'SELECT DISTINCT unnest(genres) AS value FROM movies'),
    scatter(region, 'SELECT DISTINCT language AS value FROM movies WHERE language IS NOT NULL'),
    scatter(region, 'SELECT min(release_year) AS min, max(release_year) AS max FROM movies'),
  ]);
  const uniq = (rows) => [...new Set(rows.map((r) => r.value))].sort();
  const mins = years.rows.map((r) => r.min).filter(Boolean);
  const maxs = years.rows.map((r) => r.max).filter(Boolean);
  return {
    genres: uniq(genres.rows),
    languages: uniq(languages.rows),
    years: { min: mins.length ? Math.min(...mins) : null, max: maxs.length ? Math.max(...maxs) : null },
  };
}

// ---------------- writes (admin) ----------------
function cleanRegions(list) {
  const regions = [...new Set((list || []).map((r) => String(r).toUpperCase()))];
  const bad = regions.filter((r) => !REGION_CODES.includes(r));
  if (bad.length) throw httpError(400, `Unknown region(s): ${bad.join(', ')}`);
  return regions.sort();
}

function normalizeInput(input) {
  const out = {};
  const str = (v, max = 255) => (v == null || v === '' ? null : String(v).slice(0, max));
  if (input.title !== undefined) out.title = str(input.title);
  if (input.media_type !== undefined) out.media_type = input.media_type === 'tv' ? 'tv' : 'movie';
  if (input.genres !== undefined) out.genres = (Array.isArray(input.genres) ? input.genres : String(input.genres).split(','))
    .map((g) => String(g).trim()).filter(Boolean);
  if (input.cast_members !== undefined) {
    const list = Array.isArray(input.cast_members) ? input.cast_members : String(input.cast_members).split(',');
    out.cast_members = list
      .map((c) => (typeof c === 'string' ? { name: c.trim() } : { name: c.name, character: c.character || null, profile_path: c.profile_path || null }))
      .filter((c) => c.name);
  }
  if (input.director !== undefined) out.director = str(input.director);
  if (input.release_year !== undefined) out.release_year = input.release_year ? Number(input.release_year) : null;
  if (input.language !== undefined) out.language = str(input.language, 10);
  if (input.overview !== undefined) out.overview = str(input.overview, 5000);
  if (input.poster_path !== undefined) out.poster_path = str(input.poster_path, 1000);
  if (input.backdrop_path !== undefined) out.backdrop_path = str(input.backdrop_path, 1000);
  if (input.trailer_key !== undefined) out.trailer_key = str(input.trailer_key, 64);
  if (input.popularity !== undefined) out.popularity = Number(input.popularity) || 0;
  if (input.admin_note !== undefined) out.admin_note = str(input.admin_note, 1000);
  if (input.tmdb_id !== undefined) out.tmdb_id = input.tmdb_id ? Number(input.tmdb_id) : null;
  if (input.license_regions !== undefined) out.license_regions = cleanRegions(input.license_regions);
  return out;
}

async function syncDirectory(row) {
  await directory.upsertCatalog(row).catch((e) => console.warn('[directory] upsert failed:', e.message));
}

async function createMovie(region, input) {
  const data = normalizeInput(input);
  if (!data.title) throw httpError(400, 'title is required');
  data.license_regions = data.license_regions?.length ? data.license_regions : [region];
  if (!data.license_regions.includes(region)) {
    throw httpError(400, `A title created through the ${region} gateway must be licensed for ${region} (it becomes the origin region)`);
  }
  const contentId = Number(input.content_id) || data.tmdb_id || (await directory.nextContentId());

  const row = await transaction(movieGroup(region, fragmentIndexFor(contentId)), async (c) => {
    const existing = await c.query('SELECT 1 FROM movies WHERE content_id = $1', [contentId]);
    if (existing.rowCount) throw httpError(409, `Movie ${contentId} already exists`);
    const inserted = await insertMovie(c, {
      ...data,
      content_id: contentId,
      origin_region: region,
      vclock: { [region]: 1 },
      last_writer_region: region,
    });
    await replication.enqueue(c, inserted, replication.otherRegions(inserted.license_regions, region), 'upsert');
    return inserted;
  });
  await syncDirectory(row);
  return toPublic(row);
}

async function updateMovie(region, contentId, patch) {
  const data = normalizeInput(patch);
  delete data.tmdb_id;
  if (data.title === null) throw httpError(400, 'title cannot be empty');
  if (data.license_regions && !data.license_regions.includes(region)) {
    throw httpError(400, `The ${region} gateway can't drop its own licence — delete the title instead, or edit it from another region`);
  }

  const row = await transaction(movieGroup(region, fragmentIndexFor(contentId)), async (c) => {
    const { rows } = await c.query('SELECT * FROM movies WHERE content_id = $1 FOR UPDATE', [contentId]);
    const local = rows[0];
    if (!local) throw httpError(404, `Movie ${contentId} is not stored in region ${region}`);

    const sets = [];
    const values = [contentId];
    const set = (col, value) => {
      values.push(dbValue(col, value));
      sets.push(`${col} = $${values.length}`);
    };
    Object.entries(data).forEach(([col, value]) => set(col, value));
    set('vclock', vclock.increment(local.vclock, region));
    set('last_writer_region', region);
    const { rows: updated } = await c.query(
      `UPDATE movies SET ${sets.join(', ')}, updated_at = now() WHERE content_id = $1 RETURNING *`,
      values
    );
    const next = updated[0];

    const removed = local.license_regions.filter((r) => !next.license_regions.includes(r) && r !== region);
    await replication.enqueue(c, next, replication.otherRegions(next.license_regions, region), 'upsert');
    await replication.enqueue(c, next, removed, 'delete');
    return next;
  });
  await syncDirectory(row);
  return toPublic(row);
}

async function deleteMovie(region, contentId) {
  await transaction(movieGroup(region, fragmentIndexFor(contentId)), async (c) => {
    const { rows } = await c.query('SELECT * FROM movies WHERE content_id = $1 FOR UPDATE', [contentId]);
    const local = rows[0];
    if (!local) throw httpError(404, `Movie ${contentId} is not stored in region ${region}`);
    await c.query('DELETE FROM movies WHERE content_id = $1', [contentId]);
    const tombstone = {
      ...local,
      vclock: vclock.increment(local.vclock, region),
      updated_at: new Date().toISOString(),
      last_writer_region: region,
    };
    await replication.enqueue(c, tombstone, replication.otherRegions(local.license_regions, region), 'delete');
  });
  await directory.removeCatalog(contentId).catch((e) => console.warn('[directory] remove failed:', e.message));
  return { deleted: Number(contentId) };
}

module.exports = {
  scatter, getMovie, getMoviesByIds, search, trending, filters,
  createMovie, updateMovie, deleteMovie, normalizeInput, syncDirectory, SORTS,
};
