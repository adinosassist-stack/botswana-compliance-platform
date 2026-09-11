-- v78 1.21.42 — control relapse prevention.
-- One post-effectiveness drift signal creates a quiet preventive action; repeated drift is treated as full relapse.
ALTER TABLE executive_corrective_sustainability_reviews ADD COLUMN warning_started_at TEXT;
ALTER TABLE executive_corrective_sustainability_reviews ADD COLUMN warning_reason TEXT;
ALTER TABLE executive_corrective_sustainability_reviews ADD COLUMN warning_counts_json TEXT;
ALTER TABLE executive_corrective_sustainability_reviews ADD COLUMN warning_cleared_at TEXT;

CREATE TABLE IF NOT EXISTS executive_control_preventive_actions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sustainability_review_id TEXT NOT NULL,
  corrective_action_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','superseded')),
  trigger_kind TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  trigger_counts_json TEXT NOT NULL,
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  preventive_action TEXT NOT NULL,
  target_due_at TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  completed_by_user_id TEXT,
  completion_note TEXT,
  completion_evidence TEXT,
  superseded_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(sustainability_review_id) REFERENCES executive_corrective_sustainability_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_control_preventive_open_idx
ON executive_control_preventive_actions(tenant_id,sustainability_review_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS executive_control_preventive_status_idx
ON executive_control_preventive_actions(tenant_id,status,target_due_at);
CREATE INDEX IF NOT EXISTS executive_control_preventive_action_idx
ON executive_control_preventive_actions(tenant_id,corrective_action_id,opened_at);
