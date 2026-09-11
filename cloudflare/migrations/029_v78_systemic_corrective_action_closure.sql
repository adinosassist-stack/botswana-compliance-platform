-- v78 1.21.39 — systemic corrective-action closure.
-- Recurring intervention patterns require a separate root-cause corrective action.
CREATE TABLE IF NOT EXISTS executive_corrective_actions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','superseded')),
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  corrective_action TEXT NOT NULL,
  target_due_at TEXT NOT NULL,
  target_extension_count INTEGER NOT NULL DEFAULT 0 CHECK(target_extension_count>=0),
  last_target_extended_at TEXT,
  opened_by_user_id TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  closed_by_user_id TEXT,
  closure_note TEXT,
  closure_evidence TEXT,
  baseline_counts_json TEXT NOT NULL,
  closure_counts_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(intervention_id) REFERENCES executive_exception_interventions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(opened_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_corrective_actions_active_idx
ON executive_corrective_actions(tenant_id,intervention_id)
WHERE status='open';
CREATE INDEX IF NOT EXISTS executive_corrective_actions_due_idx
ON executive_corrective_actions(tenant_id,status,target_due_at,opened_at);
CREATE INDEX IF NOT EXISTS executive_corrective_actions_owner_idx
ON executive_corrective_actions(tenant_id,owner_user_id,status,target_due_at);
