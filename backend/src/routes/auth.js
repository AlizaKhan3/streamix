// ============================================================
// AUTH — with ROAMING USERS (proposal §5.5)
//
// A user's credentials live only in their home region. On login this
// gateway asks the Global Directory for the email's home region; if it is
// another region, authentication is forwarded there over the inter-region
// link, and the resulting token is accepted by every gateway.
// If the home region is unreachable (partition), login fails rather than
// guessing — the User DB is the CP store.
// ============================================================
const router = require('express').Router();
const { LOCAL_REGION, REGION_CODES } = require('../config/topology');
const { callRegion } = require('../services/rpc');
const directory = require('../services/directory');
const { normalizeEmail } = require('../services/users');
const { signToken } = require('../middleware/auth');
const { httpError } = require('../utils/httpError');

router.post('/register', async (req, res) => {
  const { email, password, fullName, homeRegion } = req.body || {};
  const region = String(homeRegion || LOCAL_REGION).toUpperCase();
  if (!REGION_CODES.includes(region)) throw httpError(400, `homeRegion must be one of ${REGION_CODES.join(', ')}`);

  const user = await callRegion(region, 'user.register', { region, email, password, fullName });
  res.status(201).json({
    token: signToken(user),
    user,
    servedBy: { gateway: LOCAL_REGION, storedIn: region },
  });
});

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || !password) throw httpError(400, 'email and password are required');

  let homeRegion;
  let directoryDown = false;
  try {
    homeRegion = (await directory.findUser(email))?.home_region;
  } catch {
    directoryDown = true;
    homeRegion = LOCAL_REGION; // best effort: maybe the user is local
  }
  if (!homeRegion) throw httpError(401, 'Invalid email or password');

  let user;
  try {
    user = await callRegion(homeRegion, 'user.login', { region: homeRegion, email, password, servedRegion: LOCAL_REGION });
  } catch (err) {
    if (directoryDown && err.status === 401) {
      throw httpError(503, 'Global Directory is unreachable, so your home region cannot be located. Try again shortly.');
    }
    throw err;
  }

  res.json({
    token: signToken(user),
    user,
    roaming: homeRegion !== LOCAL_REGION,
    servedBy: { gateway: LOCAL_REGION, authenticatedIn: homeRegion, directoryDown },
  });
});

module.exports = router;
