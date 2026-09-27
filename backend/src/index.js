// ============================================================
// REGIONAL API GATEWAY
// One process per region (REGION=PK or REGION=US). Clients talk to the
// gateway of the region they are in and never learn which node, fragment,
// replica or region actually served them (transparency).
// ============================================================
require('./config/env');
const express = require('express');
const cors = require('cors');

const { LOCAL_REGION, REGIONS, DB_MODE } = require('./config/topology');
const authRoutes = require('./routes/auth');
const meRoutes = require('./routes/me');
const catalogRoutes = require('./routes/catalog');
const { watchlistRouter, historyRouter } = require('./routes/watchlist');
const reviewRoutes = require('./routes/reviews');
const queryRoutes = require('./routes/query');
const systemRoutes = require('./routes/system');
const adminRoutes = require('./routes/admin');
const internalRoutes = require('./routes/internal');
const replication = require('./services/replication');
const { startRecovery } = require('./services/twoPhaseCommit');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Served-By-Region', LOCAL_REGION);
  if (!req.path.startsWith('/internal')) console.log(`[${LOCAL_REGION}] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', region: LOCAL_REGION, service: 'streamix-gateway' }));

app.use('/auth', authRoutes);
app.use('/me', meRoutes);
app.use('/catalog', catalogRoutes);
app.use('/watchlist', watchlistRouter);
app.use('/history', historyRouter);
app.use('/reviews', reviewRoutes);
app.use('/query', queryRoutes);
app.use('/system', systemRoutes);
app.use('/admin', adminRoutes);
app.use('/internal', internalRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`[${LOCAL_REGION}]`, err.message);
  res.status(status).json({
    error: status >= 500 && !err.status ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Streamix gateway — region ${LOCAL_REGION} (${REGIONS[LOCAL_REGION].name}) on :${PORT} [db-mode=${DB_MODE}]`);
  replication.startWorker(LOCAL_REGION);
  startRecovery(LOCAL_REGION);
});
