require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const catalogRoutes = require('./routes/catalog');
const watchlistRoutes = require('./routes/watchlist');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

// Simple request log — handy when demoing which shard/region served a request.
app.use((req, _res, next) => { console.log(`${req.method} ${req.path}`); next(); });

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ddb-movie-streaming-api' }));

app.use('/auth', authRoutes);
app.use('/catalog', catalogRoutes);
app.use('/watchlist', watchlistRoutes);
app.use('/reviews', reviewRoutes);
app.use('/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API gateway listening on :${PORT}`));
