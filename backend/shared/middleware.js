const { ValidationError } = require('./validators');
const { log } = require('./logger');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorHandler(err, req, res, _next) {
  if (err instanceof ValidationError || err.name === 'ValidationError') {
    return res.status(err.status || 400).json({
      error: err.message || 'Validation failed',
      details: err.details || [],
    });
  }
  const status = err.status || err.statusCode || 500;
  log.error('request_error', {
    service: process.env.SERVICE_NAME || 'unknown',
    path: req.path,
    method: req.method,
    status,
    message: err.message,
  });
  if (status >= 500) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(status).json({ error: err.message || 'Request failed' });
}

/** Service-to-service auth for /internal/* routes. */
function requireInternal(req, res, next) {
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  if (!expected) {
    // Dev fallback: still require header so internals aren't wide open accidentally
    log.warn('INTERNAL_SERVICE_SECRET unset — internal routes reject all calls');
    return res.status(503).json({ error: 'Internal auth not configured' });
  }
  const got = req.headers['x-internal-secret'];
  if (got !== expected) return res.status(403).json({ error: 'Forbidden' });
  next();
}

function requestLogger(serviceName) {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      log.info('http', {
        service: serviceName,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms: Date.now() - start,
      });
    });
    next();
  };
}

module.exports = {
  asyncHandler,
  errorHandler,
  requireInternal,
  requestLogger,
};
