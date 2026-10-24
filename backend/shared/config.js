/**
 * Fail-fast env validation for services that need secrets.
 */
const { log } = require('./logger');

function requireEnv(keys, { service = 'service' } = {}) {
  const missing = keys.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    log.error('config_invalid', { service, missing });
    throw new Error(`[${service}] Missing required env: ${missing.join(', ')}`);
  }
}

function assertJwtSecret(service) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change_this_to_a_long_random_string' || secret.length < 16) {
    log.warn('weak_jwt_secret', {
      service,
      hint: 'Set JWT_SECRET to a long random string (≥16 chars) before production demos',
    });
  }
}

module.exports = { requireEnv, assertJwtSecret };
