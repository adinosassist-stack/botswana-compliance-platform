
ALTER TABLE notification_preferences ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Africa/Gaborone';

CREATE TABLE IF NOT EXISTS regulatory_source_reviews(
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','rejected','conflict')),
  content_hash TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES regulatory_sources(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS regulatory_source_reviews_source_idx
ON regulatory_source_reviews(source_id,created_at DESC);

CREATE TABLE IF NOT EXISTS regulatory_rule_reviews(
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','blocked')),
  definition_hash TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  notes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS regulatory_rule_reviews_rule_idx
ON regulatory_rule_reviews(rule_id,created_at DESC);
