PRAGMA foreign_keys=ON;

-- v78: data-minimised metadata for read-only Business Protection Copilot runs.
-- Questions and answers are deliberately not persisted.
CREATE TABLE IF NOT EXISTS ai_advisor_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL
    CHECK(mode IN ('ask','next_actions','explain_risk','management_brief','tender_readiness')),
  status TEXT NOT NULL
    CHECK(status IN ('completed','fallback','failed')),
  generation_mode TEXT NOT NULL
    CHECK(generation_mode IN ('workers_ai','structured_fallback')),
  model TEXT,
  context_counts_json TEXT NOT NULL DEFAULT '{}',
  source_count INTEGER NOT NULL DEFAULT 0,
  credits_used INTEGER NOT NULL DEFAULT 0,
  output_hash TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_advisor_runs_tenant_time_idx
ON ai_advisor_runs(tenant_id,created_at DESC);
