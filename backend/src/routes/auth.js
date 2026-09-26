const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { userWriteConn, userReadConn } = require('../db/shardRouter');

// Register — writes to users_auth AND users_profile (two vertical fragments,
// same logical entity, same transaction so they stay consistent).
router.post('/register', async (req, res) => {
  const { email, password, fullName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const client = await userWriteConn().connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);
    const authResult = await client.query(
      `INSERT INTO users_auth (email, password_hash) VALUES ($1, $2) RETURNING user_id, email, role`,
      [email, passwordHash]
    );
    const user = authResult.rows[0];
    await client.query(
      `INSERT INTO users_profile (user_id, full_name) VALUES ($1, $2)`,
      [user.user_id, fullName || null]
    );
    await client.query('COMMIT');

    const token = jwt.sign({ sub: user.user_id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Reads can be served by the replica — logins are frequent, low-stakes reads.
    const { rows } = await userReadConn().query(
      `SELECT user_id, email, password_hash, role FROM users_auth WHERE email = $1`, [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await userWriteConn().query(`UPDATE users_auth SET last_login_at = now() WHERE user_id = $1`, [user.user_id]);
    const token = jwt.sign({ sub: user.user_id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { user_id: user.user_id, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
