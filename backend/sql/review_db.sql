-- ============================================================
-- REVIEW DATABASE — one per region (pk-review, us-review)
--
-- A movie's reviews live in the review DB of the movie's ORIGIN region,
-- next to the movie row whose rating aggregate they feed. Submitting a
-- review is a DISTRIBUTED TRANSACTION across this node and the movie
-- fragment node (proposal §5.3), run either as:
--   * Two-Phase Commit  (PREPARE TRANSACTION / COMMIT PREPARED), or
--   * a Saga with a compensating delete.
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
    id                BIGSERIAL PRIMARY KEY,
    user_id           UUID NOT NULL,
    user_name         VARCHAR(120),
    user_home_region  VARCHAR(4),
    movie_id          BIGINT NOT NULL,
    rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment           TEXT,
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved',  -- 'approved' | 'pending' | 'removed'
    protocol          VARCHAR(8),                               -- '2pc' | 'saga' | 'seed'
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_movie  ON reviews (movie_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user   ON reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (moderation_status);

-- 2PC COORDINATOR LOG: the decision is durably recorded here before
-- phase 2, so in-doubt prepared transactions can be resolved after a crash.
CREATE TABLE IF NOT EXISTS twopc_log (
    tx_id        VARCHAR(64) PRIMARY KEY,
    label        VARCHAR(64),
    participants JSONB NOT NULL,
    decision     VARCHAR(10) NOT NULL,      -- 'commit' | 'abort'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- SAGA LOG: every step and compensation of a review saga.
CREATE TABLE IF NOT EXISTS saga_log (
    id         BIGSERIAL PRIMARY KEY,
    saga_id    UUID NOT NULL,
    step       VARCHAR(40) NOT NULL,
    status     VARCHAR(20) NOT NULL,        -- 'done' | 'failed' | 'compensated'
    detail     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saga_log_saga ON saga_log (saga_id);
