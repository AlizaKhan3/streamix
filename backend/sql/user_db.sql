-- ============================================================
-- USER DATABASE — one per region (pk-user-*, us-user-*)
--
-- GEO-PARTITIONING (proposal §5.5): a user's row lives ONLY in their
-- home region's User DB (data residency, e.g. PECA / GDPR). The Global
-- Directory just maps email -> home_region.
--
-- VERTICAL FRAGMENTATION (proposal §5.3): the logical "User" entity is
-- split into two physical fragments sharing the same key (user_id):
--   users_auth    -> small, hot, security-sensitive columns
--   users_profile -> larger, rarely-read columns
-- The full user is reconstructed with a join on user_id.
--
-- CAP: this store favours CONSISTENCY — auth reads always hit the
-- primary, never the (possibly stale) replica.
-- ============================================================

CREATE TABLE IF NOT EXISTS users_auth (
    user_id           UUID PRIMARY KEY,
    email             VARCHAR(255) UNIQUE NOT NULL,
    password_hash     TEXT NOT NULL,
    role              VARCHAR(20) NOT NULL DEFAULT 'user',     -- 'user' | 'admin'
    status            VARCHAR(20) NOT NULL DEFAULT 'active',   -- 'active' | 'blocked'
    home_region       VARCHAR(4) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at     TIMESTAMPTZ,
    last_login_region VARCHAR(4)
);

CREATE TABLE IF NOT EXISTS users_profile (
    user_id     UUID PRIMARY KEY REFERENCES users_auth(user_id) ON DELETE CASCADE,
    full_name   VARCHAR(120),
    avatar_url  TEXT,
    bio         TEXT,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { favoriteGenres: [], language: 'en' }
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
