-- REVIEW-ONLY candidate for isolated AI export staging. NOT deployed or registered as a migration.
CREATE TABLE IF NOT EXISTS ai_document_export_quota (
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  used INTEGER NOT NULL CHECK (used > 0),
  PRIMARY KEY (tenant_id, actor_id, window_start)
);
-- Removal of obsolete windows requires separately reviewed, bounded retention handling.
