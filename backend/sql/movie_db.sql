-- ============================================================
-- MOVIE CATALOG — deployed on every movie fragment in every region:
--   pk-movie-f0, pk-movie-f1, us-movie-f0, us-movie-f1  (+ a replica each)
--
-- HORIZONTAL FRAGMENTATION (proposal §5.3): inside a region, rows are
-- partitioned by content_id RANGE across two nodes:
--     F0: content_id <  300000
--     F1: content_id >= 300000
-- The fragment predicate is enforced by a CHECK constraint added by
-- movie_fragment0.sql / movie_fragment1.sql.
--
-- GEO-PARTITIONING (§5.5): a region only stores titles licensed for it
-- (license_regions). Globally-licensed titles are GEO-REPLICATED between
-- regions through the transactional outbox below, with vector clocks
-- (vclock) to detect concurrent edits.
-- ============================================================

CREATE TABLE IF NOT EXISTS movies (
    content_id         BIGINT PRIMARY KEY,
    tmdb_id            BIGINT,
    title              VARCHAR(255) NOT NULL,
    media_type         VARCHAR(10) NOT NULL DEFAULT 'movie',   -- 'movie' | 'tv'
    genres             TEXT[] NOT NULL DEFAULT '{}',
    cast_members       JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{ name, character, profile_path }]
    director           VARCHAR(255),
    release_year       INT,
    language           VARCHAR(10),
    overview           TEXT,
    poster_path        TEXT,
    backdrop_path      TEXT,
    trailer_key        VARCHAR(64),
    popularity         NUMERIC NOT NULL DEFAULT 0,
    admin_note         TEXT,

    -- rating aggregate, owned by the origin region, replicated last-write-wins
    rating_avg         NUMERIC(3,2) NOT NULL DEFAULT 0,
    rating_count       INT NOT NULL DEFAULT 0,
    rating_updated_at  TIMESTAMPTZ NOT NULL DEFAULT 'epoch',

    -- geo-distribution metadata
    origin_region      VARCHAR(4) NOT NULL,
    license_regions    TEXT[] NOT NULL,
    vclock             JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { "PK": 3, "US": 1 }
    last_writer_region VARCHAR(4) NOT NULL,

    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movies_genres     ON movies USING gin (genres);
CREATE INDEX IF NOT EXISTS idx_movies_year       ON movies (release_year);
CREATE INDEX IF NOT EXISTS idx_movies_language   ON movies (language);
CREATE INDEX IF NOT EXISTS idx_movies_popularity ON movies (popularity DESC);
CREATE INDEX IF NOT EXISTS idx_movies_title      ON movies (lower(title));

-- TRANSACTIONAL OUTBOX: written in the SAME local transaction as the
-- movie change, then shipped asynchronously to the other region(s).
-- This is what makes cross-region replication eventually consistent
-- without ever blocking a local write on the inter-region link.
CREATE TABLE IF NOT EXISTS replication_outbox (
    id            BIGSERIAL PRIMARY KEY,
    content_id    BIGINT NOT NULL,
    op            VARCHAR(10) NOT NULL,          -- 'upsert' | 'delete'
    target_region VARCHAR(4) NOT NULL,
    payload       JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at  TIMESTAMPTZ,
    attempts      INT NOT NULL DEFAULT 0,
    last_error    TEXT,
    result        JSONB
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON replication_outbox (id) WHERE delivered_at IS NULL;
