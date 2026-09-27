// Profile management — always executed in the user's home region.
const router = require('express').Router();
const { requireAuth, signToken } = require('../middleware/auth');
const { callRegion } = require('../services/rpc');
const { LOCAL_REGION } = require('../config/topology');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const profile = await callRegion(req.user.home_region, 'user.getProfile', { user: req.user });
  res.json({ ...profile, servedBy: { gateway: LOCAL_REGION, storedIn: req.user.home_region } });
});

router.patch('/', async (req, res) => {
  const profile = await callRegion(req.user.home_region, 'user.updateProfile', { user: req.user, patch: req.body || {} });
  // name is inside the token, so hand back a fresh one
  res.json({ profile, token: signToken(profile) });
});

module.exports = router;
