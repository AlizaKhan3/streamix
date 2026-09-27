-- ============================================================
-- WATCHLIST DATABASE — one per region (pk-watchlist, us-watchlist)
--
-- Personal data, so it lives in the user's HOME region. A roaming user
-- (home = PK, currently in US) has their watchlist reads/writes routed
-- back to the PK node by the US gateway.
--
-- title / poster / genres are a denormalised snapshot so the list can be
-- shown even when a title isn't licensed in the region the user is in.
-- ============================================================

CREATE TABLE IF NOT EXISTS watchlist (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,
    content_id  BIGINT NOT NULL,
    title       VARCHAR(255),
    poster_path TEXT,
    genres      TEXT[] NOT NULL DEFAULT '{}',
    status      VARCHAR(20) NOT NULL DEFAULT 'saved',   -- 'saved' | 'watching' | 'watched'
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist (user_id);

-- VIEWING HISTORY
CREATE TABLE IF NOT EXISTS watch_history (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID NOT NULL,
    content_id    BIGINT NOT NULL,
    title         VARCHAR(255),
    poster_path   TEXT,
    genres        TEXT[] NOT NULL DEFAULT '{}',
    event         VARCHAR(12) NOT NULL,                 -- 'started' | 'completed'
    served_region VARCHAR(4),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_user ON watch_history (user_id, created_at DESC);
