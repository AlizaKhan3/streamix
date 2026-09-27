const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Both regional gateways share JWT_SECRET, so a token issued by the user's
 * home region is accepted by any region they roam into.
 */
function signToken(user) {
  return jwt.sign(
    { sub: user.user_id, email: user.email, role: user.role, home_region: user.home_region, name: user.full_name || null },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function decode(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return jwt.verify(token, process.env.JWT_SECRET);
}

function requireAuth(req, res, next) {
  try {
    req.user = decode(req);
    if (!req.user) return res.status(401).json({ error: 'Missing bearer token' });
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Attaches req.user when a valid token is present, but never rejects. */
function optionalAuth(req, _res, next) {
  try {
    req.user = decode(req) || null;
  } catch {
    req.user = null;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

/** Gateway-to-gateway calls authenticate with a shared secret. */
function requireInternal(req, res, next) {
  const given = Buffer.from(String(req.headers['x-internal-secret'] || ''));
  const expected = Buffer.from(process.env.INTERNAL_SECRET);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(403).json({ error: 'Internal endpoint' });
  }
  next();
}

module.exports = { signToken, requireAuth, optionalAuth, requireAdmin, requireInternal };
