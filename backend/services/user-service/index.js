require('dotenv').config();
process.env.SERVICE_NAME = 'user-service';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { userWriteConn, userReadConn, healthUserDb } = require('../../shared/movieShardRouter');
const { validateRegisterBody, validateLoginBody } = require('../../shared/validators');
const { asyncHandler, errorHandler, requestLogger } = require('../../shared/middleware');
const { assertJwtSecret } = require('../../shared/config');
const { log } = require('../../shared/logger');
const { acquireEmailLock, releaseEmailLock } = require('../../shared/redis');

assertJwtSecret('user-service');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(requestLogger('user-service'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try again later' },
});

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

app.get('/health', asyncHandler(async (_req, res) => {
  const db = await healthUserDb();
  const ok = db.status === 'ok';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', service: 'user-service', db });
}));

app.post('/auth/register', authLimiter, asyncHandler(async (req, res) => {
  const { email, password, fullName } = validateRegisterBody(req.body);

  // Diagram: Redis "username lock" — serialize concurrent register for same email
  const lock = await acquireEmailLock(email);
  if (!lock.acquired) {
    return res.status(409).json({ error: 'Registration already in progress for this email' });
  }

  let client;
  try {
    client = await userWriteConn().connect();
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const authResult = await client.query(
      `INSERT INTO users_auth (email, password_hash) VALUES ($1, $2) RETURNING user_id, email, role`,
      [email, passwordHash]
    );
    const user = authResult.rows[0];
    await client.query(
      `INSERT INTO users_profile (user_id, full_name) VALUES ($1, $2)`,
      [user.user_id, fullName]
    );
    await client.query('COMMIT');

    const token = jwt.sign(
      { sub: user.user_id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.status(201).json({ token, user });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  } finally {
    if (client) client.release();
    await releaseEmailLock(lock.key);
  }
}));

app.post('/auth/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = validateLoginBody(req.body);
  const { rows } = await userReadConn().query(
    `SELECT user_id, email, password_hash, role FROM users_auth WHERE email = $1`,
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  await userWriteConn().query(`UPDATE users_auth SET last_login_at = now() WHERE user_id = $1`, [user.user_id]);
  const token = jwt.sign(
    { sub: user.user_id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.json({ token, user: { user_id: user.user_id, email: user.email, role: user.role } });
}));

app.use(errorHandler);

const PORT = process.env.USER_SERVICE_PORT || 4001;
app.listen(PORT, () => log.info('listening', { service: 'user-service', port: Number(PORT) }));
