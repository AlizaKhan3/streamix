// ============================================================
// USER MODULE — runs in the user's HOME region only.
//
// CAP positioning (proposal §5.3): the User DB favours CONSISTENCY. Every
// read here goes to the primary (readPrimary), never the replica, so a
// changed password / blocked account is never served stale.
// ============================================================
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { userGroup } = require('../config/topology');
const { readPrimary, transaction, write } = require('../db/router');
const directory = require('./directory');
const { httpError } = require('../utils/httpError');

const PUBLIC_COLUMNS = `a.user_id, a.email, a.role, a.status, a.home_region, a.created_at,
  a.last_login_at, a.last_login_region, p.full_name, p.avatar_url, p.bio, p.preferences`;

// Reconstructs the logical user from its two VERTICAL FRAGMENTS.
const USER_JOIN = 'users_auth a JOIN users_profile p ON p.user_id = a.user_id';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Registration is a small saga across two nodes:
 *   1. claim the email in the Global Directory (global uniqueness + home region)
 *   2. insert both vertical fragments in the home region's User DB (one local tx)
 *   compensation: if (2) fails, release the directory claim.
 */
async function register({ region, email, password, fullName, role = 'user' }) {
  email = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, 'A valid email is required');
  if (!password || password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

  const userId = crypto.randomUUID();
  try {
    await directory.claimEmail(email, userId, region);
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'Email already registered');
    throw err;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await transaction(userGroup(region), async (c) => {
      await c.query(
        `INSERT INTO users_auth (user_id, email, password_hash, role, home_region) VALUES ($1, $2, $3, $4, $5)`,
        [userId, email, passwordHash, role, region]
      );
      await c.query(`INSERT INTO users_profile (user_id, full_name) VALUES ($1, $2)`, [userId, fullName || null]);
    });
  } catch (err) {
    await directory.releaseEmail(email, userId).catch(() => {});
    throw err;
  }
  return getById(region, userId);
}

async function getById(region, userId) {
  const { rows } = await readPrimary(userGroup(region), (c) =>
    c.query(`SELECT ${PUBLIC_COLUMNS} FROM ${USER_JOIN} WHERE a.user_id = $1`, [userId])
  );
  return rows[0] || null;
}

async function login({ region, email, password, servedRegion }) {
  email = normalizeEmail(email);
  const { rows } = await readPrimary(userGroup(region), (c) =>
    c.query(`SELECT ${PUBLIC_COLUMNS}, a.password_hash FROM ${USER_JOIN} WHERE a.email = $1`, [email])
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
    throw httpError(401, 'Invalid email or password');
  }
  if (user.status === 'blocked') throw httpError(403, 'This account has been blocked by an administrator');

  await write(userGroup(region), (c) =>
    c.query('UPDATE users_auth SET last_login_at = now(), last_login_region = $2 WHERE user_id = $1', [user.user_id, servedRegion || region])
  );
  delete user.password_hash;
  return user;
}

async function getProfile({ user }) {
  const profile = await getById(user.home_region, user.sub);
  if (!profile) throw httpError(404, 'User not found');
  return profile;
}

async function updateProfile({ user, patch }) {
  const fields = [];
  const values = [];
  const set = (col, value) => {
    values.push(value);
    fields.push(`${col} = $${values.length}`);
  };
  if (patch.fullName !== undefined) set('full_name', String(patch.fullName).slice(0, 120));
  if (patch.bio !== undefined) set('bio', String(patch.bio).slice(0, 500));
  if (patch.avatarUrl !== undefined) set('avatar_url', patch.avatarUrl || null);
  if (patch.preferences !== undefined) {
    const prefs = {
      favoriteGenres: Array.isArray(patch.preferences.favoriteGenres) ? patch.preferences.favoriteGenres.slice(0, 10) : [],
      language: patch.preferences.language || null,
    };
    set('preferences', JSON.stringify(prefs));
  }
  if (fields.length) {
    values.push(user.sub);
    await write(userGroup(user.home_region), (c) =>
      c.query(`UPDATE users_profile SET ${fields.join(', ')}, updated_at = now() WHERE user_id = $${values.length}`, values)
    );
  }
  return getProfile({ user });
}

// ---------------- admin ----------------
async function listUsers({ region, q }) {
  const { rows } = await readPrimary(userGroup(region), (c) =>
    c.query(
      `SELECT ${PUBLIC_COLUMNS} FROM ${USER_JOIN}
       WHERE ($1::text IS NULL OR a.email ILIKE '%' || $1 || '%' OR p.full_name ILIKE '%' || $1 || '%')
       ORDER BY a.created_at DESC LIMIT 200`,
      [q || null]
    )
  );
  return rows;
}

async function updateUser({ region, userId, role, status }) {
  if (role && !['user', 'admin'].includes(role)) throw httpError(400, 'role must be user or admin');
  if (status && !['active', 'blocked'].includes(status)) throw httpError(400, 'status must be active or blocked');
  const { rowCount } = await write(userGroup(region), (c) =>
    c.query(
      'UPDATE users_auth SET role = COALESCE($2, role), status = COALESCE($3, status) WHERE user_id = $1',
      [userId, role || null, status || null]
    )
  );
  if (!rowCount) throw httpError(404, 'User not found in this region');
  return getById(region, userId);
}

module.exports = { register, login, getProfile, updateProfile, listUsers, updateUser, normalizeEmail };
