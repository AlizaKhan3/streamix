// ============================================================
// WATCHLIST + HISTORY — stored in the user's HOME region, reached through
// callRegion(), so a roaming user keeps their list. Each item is annotated
// with whether it is licensed in the region the user is in right now.
// ============================================================
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { LOCAL_REGION } = require('../config/topology');
const { callRegion } = require('../services/rpc');
const movies = require('../services/movies');
const directory = require('../services/directory');
const { httpError } = require('../utils/httpError');

router.use(requireAuth);

const home = (req) => req.user.home_region;
const snapshot = (m) => ({ content_id: m.content_id, title: m.title, poster_path: m.poster_path, genres: m.genres });

/** The movie must be licensed here to be added/played from this region. */
async function localMovieOrFail(contentId) {
  const movie = await movies.getMovie(LOCAL_REGION, Number(contentId));
  if (movie) return movie;
  const entry = await directory.catalogEntry(contentId).catch(() => null);
  if (entry) throw httpError(451, `"${entry.title}" is not licensed in region ${LOCAL_REGION}`, { availableIn: entry.regions });
  throw httpError(404, 'Title not found');
}

async function annotate(items) {
  const local = await movies.getMoviesByIds(LOCAL_REGION, items.map((i) => i.content_id));
  const byId = new Map(local.map((m) => [m.content_id, m]));
  return items.map((i) => {
    const m = byId.get(i.content_id);
    return {
      ...i,
      availableHere: !!m,
      poster_path: m?.poster_path || i.poster_path,
      rating_avg: m?.rating_avg ?? null,
    };
  });
}

router.get('/', async (req, res) => {
  const items = await callRegion(home(req), 'watchlist.list', { user: req.user });
  res.json({ items: await annotate(items), storedIn: home(req), servedBy: LOCAL_REGION });
});

router.get('/status/:contentId', async (req, res) => {
  const item = await callRegion(home(req), 'watchlist.statusOf', { user: req.user, contentId: Number(req.params.contentId) });
  res.json({ inWatchlist: !!item, item });
});

router.post('/', async (req, res) => {
  const movie = await localMovieOrFail(req.body?.contentId);
  const item = await callRegion(home(req), 'watchlist.add', { user: req.user, movie: snapshot(movie), status: req.body?.status || 'saved' });
  res.status(201).json({ item, storedIn: home(req) });
});

router.patch('/:contentId', async (req, res) => {
  const item = await callRegion(home(req), 'watchlist.setStatus', {
    user: req.user, contentId: Number(req.params.contentId), status: req.body?.status,
  });
  res.json({ item });
});

router.delete('/:contentId', async (req, res) => {
  await callRegion(home(req), 'watchlist.remove', { user: req.user, contentId: Number(req.params.contentId) });
  res.status(204).end();
});

// ---------------- viewing history ----------------
const history = require('express').Router();
history.use(requireAuth);

history.get('/', async (req, res) => {
  const items = await callRegion(home(req), 'watchlist.history', { user: req.user });
  res.json({ items: await annotate(items), storedIn: home(req) });
});

history.post('/', async (req, res) => {
  const movie = await localMovieOrFail(req.body?.contentId);
  const entry = await callRegion(home(req), 'watchlist.recordHistory', {
    user: req.user, movie: snapshot(movie), event: req.body?.event, servedRegion: LOCAL_REGION,
  });
  res.status(201).json(entry);
});

module.exports = { watchlistRouter: router, historyRouter: history, localMovieOrFail };
