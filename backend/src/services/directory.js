// ============================================================
// GLOBAL CATALOG DIRECTORY client (proposal §5.5)
//   * content_id -> regions hosting it   (cross-region discovery)
//   * email      -> home_region          (roaming-user lookup)
//   * global content-id allocator, conflict log
// ============================================================
const { directoryGroup, REGION_CODES } = require('../config/topology');
const { read, write } = require('../db/router');

const dir = () => directoryGroup();

// ---------------- users ----------------
async function claimEmail(email, userId, homeRegion) {
  await write(dir(), (c) =>
    c.query('INSERT INTO user_directory (email, user_id, home_region) VALUES ($1, $2, $3)', [email, userId, homeRegion])
  );
}

async function releaseEmail(email, userId) {
  await write(dir(), (c) => c.query('DELETE FROM user_directory WHERE email = $1 AND user_id = $2', [email, userId]));
}

async function findUser(email) {
  const { rows } = await read(dir(), (p) => p.query('SELECT * FROM user_directory WHERE email = $1', [email]));
  return rows[0] || null;
}

// ---------------- catalog ----------------
async function upsertCatalog(movie) {
  const regions = [...movie.license_regions].sort();
  await write(dir(), (c) =>
    c.query(
      `INSERT INTO catalog_directory (content_id, title, origin_region, regions, license_scope, poster_path, release_year, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (content_id) DO UPDATE SET
         title = EXCLUDED.title, regions = EXCLUDED.regions, license_scope = EXCLUDED.license_scope,
         poster_path = EXCLUDED.poster_path, release_year = EXCLUDED.release_year, updated_at = now()`,
      [
        movie.content_id, movie.title, movie.origin_region, regions,
        regions.length === REGION_CODES.length ? 'global' : 'regional',
        movie.poster_path || null, movie.release_year || null,
      ]
    )
  );
}

async function removeCatalog(contentId) {
  await write(dir(), (c) => c.query('DELETE FROM catalog_directory WHERE content_id = $1', [contentId]));
}

async function catalogEntry(contentId) {
  const { rows } = await read(dir(), (p) => p.query('SELECT * FROM catalog_directory WHERE content_id = $1', [contentId]));
  return rows[0] || null;
}

async function searchCatalog(q, limit = 30) {
  const { rows } = await read(dir(), (p) =>
    p.query(
      `SELECT * FROM catalog_directory WHERE ($1::text IS NULL OR title ILIKE '%' || $1 || '%')
       ORDER BY title LIMIT $2`,
      [q || null, limit]
    )
  );
  return rows;
}

async function nextContentId() {
  const { rows } = await write(dir(), (c) => c.query("SELECT nextval('content_id_seq') AS id"));
  return Number(rows[0].id);
}

// ---------------- conflicts ----------------
async function logConflict(entry) {
  await write(dir(), (c) =>
    c.query(
      `INSERT INTO conflict_log (content_id, detected_in, remote_region, local_vclock, remote_vclock, merged_vclock, winner, resolution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.contentId, entry.detectedIn, entry.remoteRegion, JSON.stringify(entry.localClock),
        JSON.stringify(entry.remoteClock), JSON.stringify(entry.mergedClock), entry.winner, entry.resolution,
      ]
    )
  );
}

async function listConflicts(limit = 30) {
  const { rows } = await read(dir(), (p) => p.query('SELECT * FROM conflict_log ORDER BY id DESC LIMIT $1', [limit]));
  return rows;
}

module.exports = {
  claimEmail, releaseEmail, findUser,
  upsertCatalog, removeCatalog, catalogEntry, searchCatalog, nextContentId,
  logConflict, listConflicts,
};
