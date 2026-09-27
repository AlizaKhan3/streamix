require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');

const app = express();
app.use(cors());

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
    // Express strips the mount path before the middleware sees the request;
    // put the service prefix back so upstream routes like /catalog/trending match.
    pathRewrite: (path) => `${prefix}${path === '/' ? '' : path}`,
    onProxyReq(proxyReq, req) {
      if (req.headers.authorization) proxyReq.setHeader('Authorization', req.headers.authorization);
      if (req.headers['x-client-region']) proxyReq.setHeader('X-Client-Region', req.headers['x-client-region']);
    },
    onError(err, _req, res) {
      console.error('[gateway] proxy error', err.message);
      if (!res.headersSent) res.status(502).json({ error: 'Upstream service unavailable', detail: err.message });
    },
  });
}

app.get('/health', async (_req, res) => {
  const checks = {};
  await Promise.all(
    Object.entries(SERVICES).map(async ([name, url]) => {
      try {
        const r = await axios.get(`${url}/health`, { timeout: 2000 });
        checks[name] = r.data;
      } catch (err) {
        checks[name] = { status: 'down', error: err.message };
      }
    })
  );
  const allOk = Object.values(checks).every((c) => c && c.status === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    service: 'api-gateway',
    polyglot: true,
    services: checks,
  });
});

app.use('/auth', proxy(SERVICES.user, '/auth'));
app.use('/catalog', proxy(SERVICES.catalog, '/catalog'));
app.use('/admin', proxy(SERVICES.catalog, '/admin'));
app.use('/watchlist', proxy(SERVICES.watchlist, '/watchlist'));
app.use('/reviews', proxy(SERVICES.review, '/reviews'));
app.use('/recommendations', proxy(SERVICES.recommendation, '/recommendations'));
app.use('/analytics', proxy(SERVICES.analytics, '/analytics'));

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[gateway] listening on :${PORT}`));
