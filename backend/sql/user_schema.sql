-- ============================================================
-- USER DATABASE — VERTICAL FRAGMENTATION
-- The logical "users" entity is split into two physical tables:
--   users_auth    -> hot, security-sensitive, small columns (read on every request)
--   users_profile -> larger, less frequently accessed columns
-- Both share the same primary key (user_id), joined only when a full
-- profile is needed. This is a textbook vertical fragmentation example.
-- ============================================================

CREATE TABLE IF NOT EXISTS users_auth (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'user', -- 'user' | 'admin'
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS users_profile (
    user_id       UUID PRIMARY KEY REFERENCES users_auth(user_id) ON DELETE CASCADE,
    full_name     VARCHAR(120),
    avatar_url    TEXT,
    bio           TEXT,
    preferences   JSONB DEFAULT '{}'::jsonb,   -- favorite genres, language, autoplay etc.
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_auth_email ON users_auth(email);
