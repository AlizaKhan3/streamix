// ============================================================
// Resolves which region a request is "closest to" so the shard router
// can prefer that region's replica. In a real deployment this would come
// from the CDN/load balancer (e.g. a Cloudflare/ALB geo header); here the
// mobile app sets X-Client-Region itself (see mobile-src services/api.ts),
// which is enough to demonstrate region-aware routing for the course
// project without needing real geo-IP infrastructure.
// ============================================================
const KNOWN_REGIONS = ['US', 'EU'];

function resolveRegion(req, _res, next) {
  const header = req.headers['x-client-region'];
  const query = req.query.region;
  const candidate = (header || query || 'US').toString().toUpperCase();
  req.clientRegion = KNOWN_REGIONS.includes(candidate) ? candidate : 'US';
  next();
}

module.exports = { resolveRegion, KNOWN_REGIONS };
