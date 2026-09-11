-- v78 1.21.41 — control sustainability monitoring.
-- Effectiveness verification starts a quiet 90-day sustainability watch; later recurrence removes the current sustained state without rewriting historical evidence.
CREATE TABLE IF NOT EXISTS executive_corrective_sustainability_reviews(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  effectiveness_review_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'watching' CHECK(status IN ('watching','sustained','relapsed')),
  watch_days INTEGER NOT NULL DEFAULT 90 CHECK(watch_days BETWEEN 30 AND 180),
  watch_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  watch_due_at TEXT NOT NULL,
  baseline_counts_json TEXT NOT NULL,
  observed_counts_json TEXT,
  last_checked_at TEXT,
  sustained_at TEXT,
  relapsed_at TEXT,
  relapse_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(effectiveness_review_id) REFERENCES executive_corrective_effectiveness_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,effectiveness_review_id)
);
CREATE INDEX IF NOT EXISTS executive_corrective_sustainability_status_idx
ON executive_corrective_sustainability_reviews(tenant_id,status,watch_due_at);
CREATE INDEX IF NOT EXISTS executive_corrective_sustainability_action_idx
ON executive_corrective_sustainability_reviews(tenant_id,corrective_action_id,status);
