-- v78 1.21.40 — corrective-action effectiveness verification.
-- Root-cause remediation is not considered stabilized until a defined monitoring period and evidence-backed effectiveness decision are complete.
CREATE TABLE IF NOT EXISTS executive_corrective_effectiveness_reviews(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK(status IN ('monitoring','ready','passed','failed')),
  monitoring_days INTEGER NOT NULL CHECK(monitoring_days BETWEEN 14 AND 90),
  monitoring_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  monitoring_due_at TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  baseline_counts_json TEXT NOT NULL,
  observed_counts_json TEXT,
  verification_evidence TEXT,
  verification_note TEXT,
  failure_reason TEXT,
  verified_at TEXT,
  verified_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,corrective_action_id)
);
CREATE INDEX IF NOT EXISTS executive_corrective_effectiveness_status_idx
ON executive_corrective_effectiveness_reviews(tenant_id,status,monitoring_due_at);
CREATE INDEX IF NOT EXISTS executive_corrective_effectiveness_action_idx
ON executive_corrective_effectiveness_reviews(tenant_id,corrective_action_id,status);
