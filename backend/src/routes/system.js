// Read-only system information for the app's "Distributed System" screen.
const router = require('express').Router();
const { LOCAL_REGION, REGIONS, REGION_CODES, MOVIE_FRAGMENTS, gatewayUrl } = require('../config/topology');
const { callRegion, isPartitioned } = require('../services/rpc');
const health = require('../services/health');
const tmdb = require('../services/tmdbService');

router.get('/info', (_req, res) => {
  res.json({
    region: LOCAL_REGION,
    regionName: REGIONS[LOCAL_REGION].name,
    regions: REGION_CODES.map((r) => ({
      code: r,
      name: REGIONS[r].name,
      gateway: gatewayUrl(r),
      local: r === LOCAL_REGION,
      partitioned: isPartitioned(r),
    })),
    fragments: MOVIE_FRAGMENTS.map((f) => ({ label: f.label, predicate: f.predicate })),
    tmdbConfigured: tmdb.isConfigured(),
    cap: {
      userDb: 'CP — auth reads/writes on the primary only; unreachable home region = login refused',
      movieDb: 'AP — reads from replicas, scatter-gather tolerates a failed fragment',
      reviewDb: 'AP across regions (aggregate replicated last-write-wins), strict 2PC within a region',
      watchlistDb: 'AP — per-user data in the home region',
      acrossRegions: 'eventual consistency via transactional outbox + vector clocks',
    },
  });
});

router.get('/topology', async (_req, res) => {
  const [local, directory, ...remote] = await Promise.all([
    health.regionTopology({ region: LOCAL_REGION }),
    health.directoryStatus(),
    ...REGION_CODES.filter((r) => r !== LOCAL_REGION).map((r) =>
      callRegion(r, 'system.topology', { region: r }).catch((err) => ({ region: r, name: REGIONS[r].name, unreachable: true, error: err.message }))
    ),
  ]);
  res.json({ servedBy: LOCAL_REGION, directory, regions: [local, ...remote] });
});

module.exports = router;
