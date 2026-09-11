CREATE TABLE IF NOT EXISTS executive_exception_interventions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  exception_key TEXT NOT NULL,
  exception_kind TEXT NOT NULL,
  exception_title TEXT NOT NULL,
  exception_target TEXT,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK(status IN ('open','claimed','ready_to_close','closed','superseded')),
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  decision TEXT NOT NULL,
  decision_note TEXT NOT NULL,
  recovery_due_at TEXT NOT NULL,
  opened_by_user_id TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  underlying_cleared_at TEXT,
  closed_at TEXT,
  closed_by_user_id TEXT,
  closure_note TEXT,
  closure_evidence_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(opened_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_exception_interventions_active_idx
ON executive_exception_interventions(tenant_id,exception_key)
WHERE status IN ('open','claimed','ready_to_close');
CREATE INDEX IF NOT EXISTS executive_exception_interventions_status_idx
ON executive_exception_interventions(tenant_id,status,recovery_due_at,opened_at);
CREATE INDEX IF NOT EXISTS executive_exception_interventions_owner_idx
ON executive_exception_interventions(tenant_id,owner_user_id,status,recovery_due_at);
