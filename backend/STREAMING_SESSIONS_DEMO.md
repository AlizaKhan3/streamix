# Demo: 1,000,000 active streaming sessions

Live concurrency lives in **Redis** (hot path). Historical analytics would go to ClickHouse in the diagram — here Redis counters are the stand-in.

## Already loaded

```bash
curl -s http://localhost:4000/analytics/streaming | jq '{activeSessions, byRegion, byMovieShard}'
```

Expected:
```json
{
  "activeSessions": 1000000,
  "byRegion": { "US": 520000, "EU": 480000 },
  "byMovieShard": { "0": 500000, "1": 500000 }
}
```

Also in the big summary:
```bash
curl -s http://localhost:4000/analytics/summary | jq .streaming.activeSessions
```

## Reload anytime

```bash
cd backend
npm run seed:sessions
# or: TOTAL=1000000 node scripts/seedStreamingSessions.js
```

## What to say in viva

> Active streaming sessions are tracked as Redis concurrency counters (not 1M Postgres rows — that would be the wrong store for hot session state). Regions and movie-shard affinity are denormalized for the dashboard. Sample sessions are kept for inspection; the scale proof is `activeSessions: 1000000`.
