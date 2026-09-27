// ============================================================
// WATCHLIST + VIEWING HISTORY — personal data, stored in the user's HOME
// region. These functions always run in that region: a roaming user's
// requests are forwarded here by the gateway they are connected to.
// ============================================================
const { watchlistGroup } = require('../config/topology');
const { read, write, transaction } = require('../db/router');
const { httpError } = require('../utils/httpError');

const STATUSES = ['saved', 'watching', 'watched'];
const toPublic = (r) => ({ ...r, id: Number(r.id), content_id: Number(r.content_id) });

async function list({ user }) {
  const { rows } = await read(watchlistGroup(user.home_region), (p) =>
    p.query('SELECT * FROM watchlist WHERE user_id = $1 ORDER BY updated_at DESC', [user.sub])
  );
  return rows.map(toPublic);
}

async function statusOf({ user, contentId }) {
  const { rows } = await read(watchlistGroup(user.home_region), (p) =>
    p.query('SELECT * FROM watchlist WHERE user_id = $1 AND content_id = $2', [user.sub, contentId])
  );
  return rows[0] ? toPublic(rows[0]) : null;
}

async function add({ user, movie, status = 'saved' }) {
  if (!STATUSES.includes(status)) throw httpError(400, `status must be one of ${STATUSES.join(', ')}`);
  const { rows } = await write(watchlistGroup(user.home_region), (c) =>
    c.query(
      `INSERT INTO watchlist (user_id, content_id, title, poster_path, genres, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, content_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [user.sub, movie.content_id, movie.title, movie.poster_path || null, movie.genres || [], status]
    )
  );
  return toPublic(rows[0]);
}

async function setStatus({ user, contentId, status }) {
  if (!STATUSES.includes(status)) throw httpError(400, `status must be one of ${STATUSES.join(', ')}`);
  const { rows } = await write(watchlistGroup(user.home_region), (c) =>
    c.query(
      'UPDATE watchlist SET status = $3, updated_at = now() WHERE user_id = $1 AND content_id = $2 RETURNING *',
      [user.sub, contentId, status]
    )
  );
  if (!rows[0]) throw httpError(404, 'Title is not in your watchlist');
  return toPublic(rows[0]);
}

async function remove({ user, contentId }) {
  await write(watchlistGroup(user.home_region), (c) =>
    c.query('DELETE FROM watchlist WHERE user_id = $1 AND content_id = $2', [user.sub, contentId])
  );
  return { removed: Number(contentId) };
}

/** Records a play event and moves the title along saved -> watching -> watched. */
async function recordHistory({ user, movie, event, servedRegion }) {
  if (!['started', 'completed'].includes(event)) throw httpError(400, 'event must be started or completed');
  return transaction(watchlistGroup(user.home_region), async (c) => {
    const { rows } = await c.query(
      `INSERT INTO watch_history (user_id, content_id, title, poster_path, genres, event, served_region)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [user.sub, movie.content_id, movie.title, movie.poster_path || null, movie.genres || [], event, servedRegion]
    );
    await c.query(
      `UPDATE watchlist SET status = $3, updated_at = now()
       WHERE user_id = $1 AND content_id = $2 AND NOT (status = 'watched' AND $3 = 'watching')`,
      [user.sub, movie.content_id, event === 'completed' ? 'watched' : 'watching']
    );
    return toPublic(rows[0]);
  });
}

async function history({ user, limit = 50 }) {
  const { rows } = await read(watchlistGroup(user.home_region), (p) =>
    p.query('SELECT * FROM watch_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [user.sub, limit])
  );
  return rows.map(toPublic);
}

module.exports = { list, statusOf, add, setStatus, remove, recordHistory, history, STATUSES };
