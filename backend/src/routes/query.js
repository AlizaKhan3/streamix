// Distributed query processing endpoints (semi-join) and recommendations.
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { LOCAL_REGION } = require('../config/topology');
const { movieRatings } = require('../services/semiJoin');
const recommendations = require('../services/recommendations');

/** GET /query/movie-ratings?genre=Drama&limit=20 — titles + live average rating via semi-join. */
router.get('/movie-ratings', async (req, res) => {
  res.json(await movieRatings(LOCAL_REGION, { genre: req.query.genre, limit: req.query.limit }));
});

/** GET /query/movie/:id/rating — "show this movie's title along with its average rating". */
router.get('/movie/:id/rating', async (req, res) => {
  const out = await movieRatings(LOCAL_REGION, { ids: [Number(req.params.id)], limit: 1 });
  res.json({ ...out, result: out.results[0] || null });
});

router.get('/recommendations', requireAuth, async (req, res) => {
  res.json(await recommendations.forUser(LOCAL_REGION, req.user, Math.min(40, Number(req.query.limit) || 20)));
});

module.exports = router;
