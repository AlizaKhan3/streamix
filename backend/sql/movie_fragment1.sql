-- Fragment predicate for movie fragment F1 (range partitioning).
ALTER TABLE movies ADD CONSTRAINT fragment_f1_range CHECK (content_id >= 300000);
