-- ============================================================
-- MOVIE CATALOG — deployed identically on EVERY movie shard
-- (movie-shard-us-master, movie-shard-eu-master ...)
--
-- HORIZONTAL FRAGMENTATION: each shard holds a disjoint subset of rows,
-- selected by hash(content_id) mod NUM_SHARDS in the application's
-- shard router (see backend/src/db/shardRouter.js). The UNION of all
-- shards' movies table == the full logical "Movie" relation.
--
-- The `home_region` column additionally records which region this row
-- was originally written into, used for region-aware read routing.
-- ============================================================

CREATE TABLE IF NOT EXISTS movies (
    content_id     BIGINT PRIMARY KEY,        -- = tmdb_id, also the shard key
    tmdb_id        BIGINT NOT NULL,
    title          VARCHAR(255) NOT NULL,
    media_type     VARCHAR(10) NOT NULL DEFAULT 'movie', -- 'movie' | 'tv'
    genres         TEXT[] DEFAULT '{}',
    cast_members   JSONB DEFAULT '[]'::jsonb,
    director       VARCHAR(255),
    release_year   INT,
    language       VARCHAR(10),
    overview       TEXT,
    poster_path    TEXT,
    backdrop_path  TEXT,
    trailer_key    VARCHAR(64),                -- YouTube key from TMDb /videos
    popularity     NUMERIC DEFAULT 0,
    rating_avg     NUMERIC DEFAULT 0,
    rating_count   INT DEFAULT 0,
    home_region    VARCHAR(10) NOT NULL DEFAULT 'US',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movies_title      ON movies USING gin (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_movies_genres      ON movies USING gin (genres);
CREATE INDEX IF NOT EXISTS idx_movies_year        ON movies(release_year);
CREATE INDEX IF NOT EXISTS idx_movies_language    ON movies(language);
CREATE INDEX IF NOT EXISTS idx_movies_popularity  ON movies(popularity DESC);
