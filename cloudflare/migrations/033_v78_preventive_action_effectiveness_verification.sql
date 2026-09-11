-- v78 1.21.43 — preventive-action effectiveness verification.
-- Preventive task completion starts observation; only evidence-backed verification clears the early-warning state.
CREATE TABLE IF NOT EXISTS executive_control_preventive_effectiveness_reviews(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  preventive_action_id TEXT NOT NULL,
  sustainability_review_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK(status IN ('monitoring','ready','passed','failed','superseded')),
  observation_days INTEGER NOT NULL DEFAULT 7 CHECK(observation_days BETWEEN 3 AND 30),
  observation_started_at TEXT NOT NULL,
  observation_due_at TEXT NOT NULL,
  baseline_counts_json TEXT NOT NULL,
  observed_counts_json TEXT,
  verification_evidence TEXT,
  verification_note TEXT,
  failure_reason TEXT,
  verified_at TEXT,
  verified_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(preventive_action_id) REFERENCES executive_control_preventive_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(sustainability_review_id) REFERENCES executive_corrective_sustainability_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,preventive_action_id)
);
CREATE INDEX IF NOT EXISTS executive_control_preventive_effectiveness_status_idx
ON executive_control_preventive_effectiveness_reviews(tenant_id,status,observation_due_at);
CREATE INDEX IF NOT EXISTS executive_control_preventive_effectiveness_action_idx
ON executive_control_preventive_effectiveness_reviews(tenant_id,corrective_action_id,observation_started_at);
