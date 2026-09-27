// ============================================================
// REVIEWS — a movie's reviews live in its ORIGIN region (next to the movie
// row whose aggregate they update), so this gateway forwards the request
// there. Submitting runs a distributed transaction: 2PC (default) or Saga.
// ============================================================
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { LOCAL_REGION, REGION_CODES } = require('../config/topology');
const { callRegion } = require('../services/rpc');
const movies = require('../services/movies');
const directory = require('../services/directory');
const { localMovieOrFail } = require('./watchlist');
const { httpError } = require('../utils/httpError');

async function originOf(movieId) {
  const movie = await movies.getMovie(LOCAL_REGION, movieId);
  if (movie) return movie.origin_region;
  const entry = await directory.catalogEntry(movieId).catch(() => null);
  if (entry) return entry.origin_region;
  throw httpError(404, 'Title not found');
}

router.get('/movie/:movieId', async (req, res) => {
  const movieId = Number(req.params.movieId);
  const origin = await originOf(movieId);
  const reviews = await callRegion(origin, 'reviews.listForMovie', { region: origin, movieId });
  res.json({ reviews, storedIn: origin, servedBy: LOCAL_REGION });
});

router.post('/', requireAuth, async (req, res) => {
  const { movieId, rating, comment, protocol, failAt } = req.body || {};
  if (!movieId) throw httpError(400, 'movieId is required');
  const movie = await localMovieOrFail(movieId); // must be licensed where the user is
  const origin = movie.origin_region;

  const result = await callRegion(origin, 'reviews.submit', {
    region: origin,
    user: req.user,
    movieId: movie.content_id,
    rating,
    comment,
    protocol: protocol === 'saga' ? 'saga' : '2pc',
    failAt: failAt === 'movie' ? 'movie' : undefined,
  });
  res.status(201).json({ ...result, storedIn: origin, servedBy: LOCAL_REGION });
});

/** The signed-in user's reviews from every region — scatter-gather across review nodes. */
router.get('/mine', requireAuth, async (req, res) => {
  const settled = await Promise.allSettled(
    REGION_CODES.map((r) => callRegion(r, 'reviews.byUser', { region: r, userId: req.user.sub }))
  );
  res.json({
    reviews: settled.filter((s) => s.status === 'fulfilled').flatMap((s) => s.value)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    regionsFailed: REGION_CODES.filter((_, i) => settled[i].status === 'rejected'),
  });
});

module.exports = router;
