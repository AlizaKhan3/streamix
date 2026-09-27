const KNOWN_REGIONS = ['US', 'EU'];

function resolveRegion(req, _res, next) {
  const header = req.headers['x-client-region'];
  const query = req.query.region;
  const candidate = (header || query || 'US').toString().toUpperCase();
  req.clientRegion = KNOWN_REGIONS.includes(candidate) ? candidate : 'US';
  next();
}

module.exports = { resolveRegion, KNOWN_REGIONS };
