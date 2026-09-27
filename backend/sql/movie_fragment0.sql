-- Fragment predicate for movie fragment F0 (range partitioning).
ALTER TABLE movies ADD CONSTRAINT fragment_f0_range CHECK (content_id >= 0 AND content_id < 300000);
