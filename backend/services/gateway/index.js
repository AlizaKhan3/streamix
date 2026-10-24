require('dotenv').config();
process.env.SERVICE_NAME = 'api-gateway';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const { log } = require('../../shared/logger');
const { requestLogger } = require('../../shared/middleware');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Region', 'X-Internal-Secret'],
}));
app.use(requestLogger('api-gateway'));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GATEWAY_RATE_LIMIT || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try again later' },
});

const SERVICES = {
  user: process.env.USER_SERVICE_URL || 'http://localhost:4001',
  catalog: process.env.CATALOG_SERVICE_URL || 'http://localhost:4002',
  watchlist: process.env.WATCHLIST_SERVICE_URL || 'http://localhost:4003',
  review: process.env.REVIEW_SERVICE_URL || 'http://localhost:4004',
  recommendation: process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:4005',
  analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:4006',
};

function proxy(target, prefix) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path) => `${prefix}${path === '/' ? '' : path}`,
    onProxyReq(proxyReq, req) {
      if (req.headers.authorization) proxyReq.setHeader('Authorization', req.headers.authorization);
      if (req.headers['x-client-region']) proxyReq.setHeader('X-Client-Region', req.headers['x-client-region']);
      if (req.headers['x-internal-secret']) proxyReq.setHeader('X-Internal-Secret', req.headers['x-internal-secret']);
    },
    onError(err, _req, res) {
      log.error('proxy_error', { message: err.message, target });
      if (!res.headersSent) res.status(502).json({ error: 'Upstream service unavailable' });
    },
  });
}

app.get('/health', async (_req, res) => {
  const checks = {};
  await Promise.all(
    Object.entries(SERVICES).map(async ([name, url]) => {
      try {
        const r = await axios.get(`${url}/health`, { timeout: 2500 });
        checks[name] = r.data;
      } catch (err) {
        checks[name] = { status: 'down', error: err.message };
      }
    })
  );
  const allOk = Object.values(checks).every((c) => c && (c.status === 'ok' || c.status === 'degraded'));
  const healthy = Object.values(checks).every((c) => c && c.status === 'ok');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : allOk ? 'degraded' : 'down',
    service: 'api-gateway',
    polyglot: true,
    elasticsearch: Boolean(process.env.ELASTICSEARCH_URL),
    services: checks,
  });
});

app.use('/auth', authLimiter, proxy(SERVICES.user, '/auth'));
app.use('/catalog', proxy(SERVICES.catalog, '/catalog'));
app.use('/admin', proxy(SERVICES.catalog, '/admin'));
app.use('/watchlist', proxy(SERVICES.watchlist, '/watchlist'));
app.use('/reviews', proxy(SERVICES.review, '/reviews'));
app.use('/recommendations', proxy(SERVICES.recommendation, '/recommendations'));
app.use('/analytics', proxy(SERVICES.analytics, '/analytics'));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => log.info('listening', { service: 'api-gateway', port: Number(PORT) }));
