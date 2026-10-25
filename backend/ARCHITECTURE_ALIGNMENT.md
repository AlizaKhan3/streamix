# Architecture diagram ↔ running code (viva cheat sheet)

Your sir’s diagram maps to this repo as follows. Say the **stand-ins** boldly — that is intentional for a local free stack.

| Diagram box | Running implementation | Distributed DB concept |
|---|---|---|
| Clients (Web/Mobile/Admin) | `StreamixApp/` + Admin sync routes | Presentation layer |
| API Gateway — Auth, routing, rate limiting | `services/gateway` `:4000` + helmet + rate limits | Single entry / distribution transparency |
| User Service → PostgreSQL P+R | `user-service` + `user-db-master/replica` | Vertical fragmentation (`users_auth` / `users_profile`) + replication |
| Catalog Service → search/filter | `catalog-service` + **Postgres US/EU movie shards** + **Elasticsearch** | Horizontal fragmentation by `hash(content_id)`; FTS search |
| Watchlist → Mongo sharded by userId | `watchlist-service` + 2 Mongo containers | Application-level sharding |
| Review → Mongo sharded by movieId | `review-service` + 2 Mongo containers | Application-level sharding |
| Review → Kafka event bus | **Redis Streams** `reviews:events` | Async messaging (Kafka stand-in) |
| Recommendation → Milvus/Pinecone | Genre-affinity scoring in `recommendation-service` | Vector DB stand-in |
| Analytics → ClickHouse | `analytics-service` + Redis counters | Columnar analytics stand-in |
| Redis — Cache + username lock | Catalog cache TTL + `lock:register:email:*` SET NX | Cache + distributed lock |
| TMDb API | `src/services/tmdbService.js` | External enrichment |

## Note on Catalog storage

The diagram labels Catalog as “MongoDB cluster”. This course implementation stores the **movie catalog in Postgres shards (US/EU)** so you can demo **relational horizontal fragmentation + primary/replica routing**. Document stores are used where the diagram places them for Watchlist/Reviews. Elasticsearch adds production-grade full-text search on top of the catalog.

## Demo proof commands

```bash
curl -s http://localhost:4000/health | jq
curl -s http://localhost:4000/analytics/summary | jq
curl -s 'http://localhost:4000/catalog/search?q=matrix' | jq '{engine,total}'
```
