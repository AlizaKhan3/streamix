-- ============================================================
-- REVIEWS — HORIZONTAL FRAGMENTATION by hash(movie_id) mod NUM_SHARDS.
-- Keeps a movie's entire review workload on one shard (fast "reviews
-- for movie X" reads); to avoid a hot shard for a viral title the
-- router can optionally add a secondary bucket hash(movie_id+bucket).
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
    id                BIGSERIAL PRIMARY KEY,
    user_id           UUID NOT NULL,
    movie_id          BIGINT NOT NULL,
    rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment           TEXT,
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved', -- 'approved' | 'pending' | 'removed'
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_movie ON reviews(movie_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user  ON reviews(user_id);
