# Distributed Movie Streaming Database — Implementation (Phase 1)

This turns your proposal + architecture PDF into running code: a Postgres cluster
that actually shards, replicates, and fragments data, a Node/Express API gateway
that routes to it, and a React Native (Netflix-style) mobile app on top.

## What's here

```
backend/            Node.js/Express API + docker-compose Postgres cluster
  docker-compose.yml    12 Postgres containers = your whole distributed cluster
  sql/                  schema.sql per database (see fragmentation notes inside)
  src/
    config/db.js        one Pool per physical node
    db/shardRouter.js    hash(key) mod N routing, primary/replica selection, scatter-gather
    routes/              auth, catalog, watchlist, reviews, admin
    services/tmdbService.js   TMDb enrichment
mobile-src/          React Native (TypeScript) source to drop into an RN CLI project
  src/screens/         Home, Search, MovieDetail (play/pause), Watchlist, Login, Register, Profile
  src/components/      HeroBanner, MovieRow, MovieCard, StarRating
```

## Course-concept → code map (for your report/viva)

| Concept | Where it lives |
|---|---|
| **Horizontal fragmentation / sharding** | `movies`, `watchlist`, `reviews` tables — one logical table, split across N physical shards by `hash(key) mod N`. See `shardRouter.js`. |
| **Vertical fragmentation** | `users_auth` vs `users_profile` (`sql/user_schema.sql`) — one logical "User" entity split by column groups. |
| **Region-wise distribution** | `movie-shard-us-*` / `movie-shard-eu-*` in `docker-compose.yml`; every movie row carries `home_region`. |
| **Replication (primary–replica)** | Every movie shard + the user DB has a `-master`/`-replica` pair using real Postgres streaming replication (bitnami image, configured via env vars — not simulated). |
| **Read/write routing** | `shardRouter.js`: writes always go to `*WriteConn()` (primary), reads use `*ReadConn()` (replica when present). |
| **Scatter-gather distributed query** | `GET /catalog/search` and `/catalog/trending` fan the same SQL to every movie shard's replica in parallel (`Promise.allSettled`), then merge/sort in the app layer. |
| **Distribution transparency** | The mobile app and route handlers never know which physical node served a request — only `shardRouter.js` does. |
| **Failure isolation** | Reviews/Watchlist failures don't affect catalog browsing (separate DBs/services); TMDb failure just means no new syncs, not app downtime. |
| **Fault tolerance / failover** | Streaming replication means a replica can be promoted if a shard's primary goes down (standard Postgres failover — document this in your report as the mechanism, promotion itself is a manual `pg_promote()` for this project's scope). |

## Running the backend

1. Install Docker Desktop.
2. `cd backend`
3. `cp .env.example .env` and fill in a `TMDB_API_KEY` (free at themoviedb.org) and a `JWT_SECRET`.
4. `docker compose up -d` — brings up all 12 Postgres nodes + the API on port 4000.
5. Get an admin JWT: register a user via `POST /auth/register`, then manually set `role='admin'` for that user in `user-db-master` (`docker exec -it user-db-master psql -U app -d user_db -c "UPDATE users_auth SET role='admin' WHERE email='you@example.com';"`).
6. Seed some movies: `POST /admin/movies/sync` with `{ "tmdbId": 27205, "region": "US" }` (Inception), repeat for a handful of titles, mixing `region: "US"` and `region: "EU"` so you can see both shards populate. Or use `POST /admin/movies/bulk-discover` with `{ "genreId": 28, "region": "US" }` to pull many at once.
7. Confirm: `GET http://localhost:4000/catalog/trending`.

No Docker? You can instead install Postgres locally, create the 7 databases by hand from the files in `backend/sql/`, and point the ports in `.env` at wherever you ran them — you just lose the pre-wired real replication that `docker-compose.yml` gives you for free.

## Running the mobile app

You said Android Studio/RN CLI isn't fully set up yet — do this once:

1. Follow the official **React Native CLI Quickstart** (not Expo) for your OS: https://reactnative.dev/docs/set-up-your-environment — installs Node, JDK, Android Studio + SDK, and (Mac only) Xcode.
2. `npx @react-native-community/cli init StreamixApp --version latest`
3. Copy this repo's `mobile-src/App.tsx` and `mobile-src/src/` folder into the new `StreamixApp/` project, overwriting the generated `App.tsx`.
4. Merge the packages listed in `mobile-src/package.json` (`dependencies_to_add`) into the generated `package.json`, then `npm install`.
5. `react-native-vector-icons` and `react-native-video` need one extra native-linking step each — their READMEs cover it (Android: add to `android/app/build.gradle`; both are optional — the app works without them if you strip the two lines that import them, since neither is currently used in a screen yet).
6. In `mobile-src/src/services/api.ts`, set `API_BASE_URL` to `http://10.0.2.2:4000` (Android emulator) or your machine's LAN IP (physical device) — both need the backend from step above running.
7. `npx react-native run-android` (start an emulator first, or plug in a device with USB debugging on).

## Scope note (matches your proposal)

Actual video **streaming/CDN delivery** is out of scope, same as your proposal states — the
"player" on the movie detail screen is a Netflix-style play/pause + progress-bar mock. Swap it
for `react-native-video` pointed at a real HLS URL later if you want true playback.

## What's next (not yet built — tell me which to do first)

- Wire `MovieDetail`'s "region served from" label live off `_region` from search (currently only shown from single-item fetch).
- A real recommendation algorithm (currently the "Recommended" rows are just genre rows — you have `users_profile.preferences` and reviews/watchlist data to build a real one from).
- Admin screen in the app itself (right now admin actions are API-only, call them via Postman/curl).
- Automated shard failover demo script.
- Unit/integration tests for `shardRouter.js`.
# ddb-streaming
