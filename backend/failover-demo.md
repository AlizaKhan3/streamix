# Shard Failover Demo (for your report / viva)

This demonstrates real Postgres primary→replica failover on the `movie-shard-us`
pair, using the actual streaming replication docker-compose already sets up
(not simulated — this is genuine Postgres WAL replication).

## 1. Confirm replication is live

```bash
docker exec -it movie-shard-us-master psql -U app -d movie_db -c "SELECT * FROM pg_stat_replication;"
```
You should see one row — the replica connected and streaming.

## 2. Prove the replica actually has the data

```bash
docker exec -it movie-shard-us-master psql -U app -d movie_db -c "SELECT count(*) FROM movies;"
docker exec -it movie-shard-us-replica psql -U app -d movie_db -c "SELECT count(*) FROM movies;"
```
Counts should match (replica may lag by a fraction of a second — this is the
"asynchronous replication may briefly return stale data" trade-off the
architecture doc calls out in §5).

## 3. Kill the primary

```bash
docker stop movie-shard-us-master
```

## 4. Observe the app degrade gracefully, not crash

- `GET /catalog/search` still returns EU-shard results (scatter-gather uses
  `Promise.allSettled`, so one failed shard doesn't fail the whole request —
  see `shardsFailed` in the response).
- `GET /catalog/movie/:id` for a US-shard movie now fails (that shard truly
  is unreachable) — this demonstrates the "blast radius limited to one
  shard" behavior from architecture §7, not full-platform downtime.
- Writes to US-region movies fail until you promote a new primary (step 5).

## 5. Promote the replica to take over as primary

```bash
docker exec -it movie-shard-us-replica psql -U app -c "SELECT pg_promote();"
```

Now `movie-shard-us-replica` accepts writes. For a real deployment you'd also
update the shard map / DNS so the app's `MOVIE_SHARD0_MASTER_*` env vars point
at the promoted node — for this course project it's enough to point them at
the (former) replica's port manually in `.env` and restart the `api`
container to show the mechanism works end-to-end:

```bash
# .env: swap MOVIE_SHARD0_MASTER_PORT to what was the replica's port
docker compose restart api
```

## 6. Bring the old primary back as a new replica (optional, advanced)

In a real cluster you'd re-base the old primary against the new one with
`pg_basebackup` so it rejoins as a replica rather than a second, conflicting
primary. Out of scope to script here, but worth one sentence in your report
as "the recovery path after failover."

---

**What to say in your viva:** the shard router never needed to change during
any of this — it always talks to "the movie-shard-us primary" and "the
movie-shard-us replica" as logical roles; only the `.env` node addresses
changed. That's the point of the shard router providing distribution
transparency.
