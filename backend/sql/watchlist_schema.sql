-- ============================================================
-- WATCHLIST — HORIZONTAL FRAGMENTATION by hash(user_id) mod NUM_SHARDS.
-- All rows for one user always land on the same shard, so per-user
-- add/remove/fetch never needs a cross-shard query.
-- ============================================================

CREATE TABLE IF NOT EXISTS watchlist (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,
    content_id  BIGINT NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'saved', -- 'saved' | 'watching' | 'watched'
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
