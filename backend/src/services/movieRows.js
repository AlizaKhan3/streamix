// Column list + row helpers for the `movies` table, shared by catalog writes,
// the geo-replication receiver and the seed script.

const META_COLUMNS = [
  'tmdb_id', 'title', 'media_type', 'genres', 'cast_members', 'director', 'release_year', 'language',
  'overview', 'poster_path', 'backdrop_path', 'trailer_key', 'popularity', 'admin_note', 'license_regions',
];

const RATING_COLUMNS = ['rating_avg', 'rating_count', 'rating_updated_at'];

const ALL_COLUMNS = [
  'content_id', ...META_COLUMNS, ...RATING_COLUMNS,
  'origin_region', 'vclock', 'last_writer_region', 'created_at', 'updated_at',
];

const JSON_COLUMNS = new Set(['cast_members', 'vclock']);

function dbValue(column, value) {
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value ?? (column === 'vclock' ? {} : []));
  return value;
}

const DEFAULTS = {
  media_type: 'movie',
  genres: [],
  cast_members: [],
  popularity: 0,
  rating_avg: 0,
  rating_count: 0,
  rating_updated_at: new Date(0),
  vclock: {},
};

/** INSERT a full movie row (every column given explicitly). */
async function insertMovie(client, row) {
  const now = new Date();
  const values = ALL_COLUMNS.map((col) => {
    let v = row[col];
    if (v === undefined || v === null) {
      if (col === 'created_at' || col === 'updated_at') v = now;
      else if (col in DEFAULTS) v = DEFAULTS[col];
      else v = null;
    }
    return dbValue(col, v);
  });
  const placeholders = ALL_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await client.query(
    `INSERT INTO movies (${ALL_COLUMNS.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

/** Numeric/bigint columns come back from pg as strings — convert for the API. */
function toPublic(row, servedBy) {
  if (!row) return row;
  const out = {
    ...row,
    content_id: Number(row.content_id),
    tmdb_id: row.tmdb_id == null ? null : Number(row.tmdb_id),
    popularity: Number(row.popularity),
    rating_avg: Number(row.rating_avg),
    rating_count: Number(row.rating_count),
  };
  if (servedBy) out._servedBy = servedBy;
  return out;
}

module.exports = { META_COLUMNS, RATING_COLUMNS, ALL_COLUMNS, dbValue, insertMovie, toPublic };
