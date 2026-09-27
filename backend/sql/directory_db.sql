-- ============================================================
-- GLOBAL CATALOG DIRECTORY (proposal §5.5)
--
-- A deliberately lightweight, global lookup service shared by both
-- regional deployments:
--   catalog_directory -> content_id => region(s) hosting it
--                        (cross-region content discovery)
--   user_directory    -> email => home_region
--                        (roaming users: the US gateway finds a PK user's
--                         home region and redirects authentication there)
--   content_id_seq    -> global id allocator for manually added titles
--   conflict_log      -> vector-clock conflicts detected during geo-replication
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_directory (
    content_id    BIGINT PRIMARY KEY,
    title         VARCHAR(255) NOT NULL,
    origin_region VARCHAR(4) NOT NULL,
    regions       TEXT[] NOT NULL,
    license_scope VARCHAR(10) NOT NULL,       -- 'regional' | 'global'
    poster_path   TEXT,
    release_year  INT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directory_title   ON catalog_directory (lower(title));
CREATE INDEX IF NOT EXISTS idx_directory_regions ON catalog_directory USING gin (regions);

CREATE TABLE IF NOT EXISTS user_directory (
    email       VARCHAR(255) PRIMARY KEY,
    user_id     UUID UNIQUE NOT NULL,
    home_region VARCHAR(4) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ids for titles that don't come from TMDb start far above any TMDb id.
CREATE SEQUENCE IF NOT EXISTS content_id_seq START 9000001;

CREATE TABLE IF NOT EXISTS conflict_log (
    id              BIGSERIAL PRIMARY KEY,
    content_id      BIGINT NOT NULL,
    detected_in     VARCHAR(4) NOT NULL,
    remote_region   VARCHAR(4) NOT NULL,
    local_vclock    JSONB NOT NULL,
    remote_vclock   JSONB NOT NULL,
    merged_vclock   JSONB NOT NULL,
    winner          VARCHAR(10) NOT NULL,     -- 'local' | 'remote'
    resolution      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
