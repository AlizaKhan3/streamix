# Distributed Movie Streaming Database — Polyglot Implementation

This turns your proposal + architecture PDF into running code: a **polyglot**
cluster (Postgres + MongoDB + Redis), real microservices behind an API gateway,
and a React Native (Netflix-style) mobile app on top.

## What's here

```
backend/                 Polyglot microservices + docker-compose cluster
  docker-compose.yml       Postgres (users+movies) + Mongo (watchlist/reviews) + Redis + 7 Node services
  shared/                  shard hash, auth, redis, pg pools, mongo shard helpers
  services/
    gateway/               :4000 path proxy (same URLs the mobile app already uses)
    user-service/          Postgres auth (vertical fragmentation)
    catalog-service/       Postgres US/EU movie shards + Redis cache
    watchlist-service/     MongoDB app-sharded by userId
    review-service/        MongoDB app-sharded by movieId + Redis Streams events
    recommendation-service/ Genre affinity across Mongo + Postgres
    analytics-service/     Aggregates (ClickHouse stand-in) + Streams consumer
  sql/                     Postgres schemas
mobile-src/ / StreamixApp/ React Native Netflix-style client
```

## Course-concept → code map (for your report/viva)

| Concept | Where it lives |
|---|---|
| **Microservices + API gateway** | `services/*` behind `services/gateway` on `:4000` |
| **Polyglot persistence** | Postgres (users, movies) + MongoDB (watchlist, reviews) + Redis (cache/events) |
| **Horizontal fragmentation / sharding** | Movies: `hash(contentId)`; watchlist/reviews: Mongo app-shards via `shared/mongoShards.js` |
| **Vertical fragmentation** | `users_auth` vs `users_profile` (`sql/user_schema.sql`) |
| **Region-wise distribution** | `movie-shard-us-*` / `movie-shard-eu-*`; `X-Client-Region` / Near You |
| **Replication (primary–replica)** | User DB + each movie shard — real Postgres WAL (Bitnami) |
| **Read/write routing** | `shared/movieShardRouter.js` |
| **Scatter-gather** | Catalog search/trending; review fan-out for recommendations |
| **Cache** | Redis TTL on `/catalog/trending` and `/catalog/search` |
| **Event bus (Kafka stand-in)** | Redis Streams `reviews:events` published by review-service, consumed by analytics |
| **Distribution transparency** | Mobile only talks to gateway; shard map is server-side |
| **Fault isolation** | Separate DBs/services; scatter-gather uses `Promise.allSettled` |

### Designed but Phase-2 (say this boldly)

Kafka cluster, Milvus/Pinecone vector DB, ClickHouse columnar analytics, MongoDB
`mongos` cluster — same roles as Redis Streams / genre affinity / analytics
service today. See [backend/POLYglot-DEMO.md](backend/POLYglot-DEMO.md).

## Running the backend

1. Install Docker Desktop.
2. `cd backend`
3. `cp .env.example .env` and set `TMDB_API_KEY` + `JWT_SECRET`.
4. `docker compose up -d --build` — Postgres + Mongo + Redis + all services; gateway on **port 4000**.
5. Promote an admin:  
   `docker exec -e PGPASSWORD=app_pass user-db-master psql -U app -d user_db -c "UPDATE users_auth SET role='admin' WHERE email='you@example.com';"`  
   then **re-login** in the app.
6. Seed movies via Admin screen or `POST /admin/movies/sync`.
7. Health: `GET http://localhost:4000/health` (lists every microservice).

**Host Node + Docker DBs:** start only data containers, then `npm install && npm start` (spawns all 7 processes; gateway still `:4000`).

## Running the mobile app

Use `StreamixApp/` (already wired). Point `API_BASE_URL` at `http://localhost:4000` (simulator) or your LAN IP (device). No API path changes — gateway preserves `/auth`, `/catalog`, `/watchlist`, `/reviews`, `/recommendations`.

## Scope note

Actual video **CDN streaming** is out of scope — in-app trailers use YouTube iframe.
Failover demo for movie Postgres shards: [backend/failover-demo.md](backend/failover-demo.md).
