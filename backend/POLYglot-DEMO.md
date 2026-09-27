# Polyglot microservices demo (local + free)

Use this for viva to prove the architecture diagram is backed by running code.

## Stack

| Layer | Tech |
|---|---|
| API Gateway | Express proxy `:4000` |
| User + Catalog | Postgres (primary/replica, US/EU movie shards) |
| Watchlist + Reviews | MongoDB (2 app-level shards each) |
| Cache + events | Redis (GET/SET cache + Streams as Kafka stand-in) |
| Analytics | Aggregates from Mongo + Redis (ClickHouse stand-in) |

**Not installed (Phase-2 scale-out):** Kafka cluster, Milvus/Pinecone, ClickHouse, Mongo `mongos` cluster.

## Start

```bash
cd backend
docker compose up -d --build
# wait ~30s for Postgres replicas
curl -s http://localhost:4000/health | jq
```

Or: infra in Docker, Node on host:

```bash
docker compose up -d user-db-master user-db-replica \
  movie-shard-us-master movie-shard-us-replica \
  movie-shard-eu-master movie-shard-eu-replica \
  watchlist-mongo-1 watchlist-mongo-2 review-mongo-1 review-mongo-2 redis
npm install && npm start
```

## Demo curls

### 1. Gateway sees all services

```bash
curl -s http://localhost:4000/health | jq
```

### 2. Mongo watchlist sharding (`shard` in response)

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"aliza@gmail.com","password":"YOUR_PASSWORD"}' | jq -r .token)

curl -s -X POST http://localhost:4000/watchlist \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"contentId":27205}' | jq
# → "_store":"mongodb", "shard": 0|1
```

### 3. Review → Redis Streams

```bash
curl -s -X POST http://localhost:4000/reviews \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"movieId":27205,"rating":5,"comment":"great"}' | jq
# → "_event":"published to Redis Streams reviews:events"
```

### 4. Redis catalog cache HIT/MISS

```bash
curl -s http://localhost:4000/catalog/trending >/dev/null   # MISS (see catalog logs)
curl -s http://localhost:4000/catalog/trending >/dev/null   # HIT
docker logs ddb-catalog-service 2>&1 | grep cache | tail
```

### 5. Analytics summary (polyglot proof)

```bash
curl -s http://localhost:4000/analytics/summary | jq
```

### 6. Postgres replication still works

```bash
docker exec -it movie-shard-us-master psql -U app -d movie_db -c "SELECT * FROM pg_stat_replication;"
```

(Use `PGPASSWORD=app_pass` if prompted.)
