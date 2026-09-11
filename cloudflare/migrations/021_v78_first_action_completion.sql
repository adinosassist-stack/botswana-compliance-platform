ALTER TABLE compliance_obligations ADD COLUMN assigned_user_id TEXT;
ALTER TABLE compliance_obligations ADD COLUMN assigned_at TEXT;
ALTER TABLE compliance_obligations ADD COLUMN started_at TEXT;
ALTER TABLE compliance_obligations ADD COLUMN review_requested_at TEXT;
ALTER TABLE compliance_obligations ADD COLUMN completed_at TEXT;
ALTER TABLE compliance_obligations ADD COLUMN completed_by_user_id TEXT;
ALTER TABLE compliance_obligations ADD COLUMN completion_note TEXT;
CREATE INDEX IF NOT EXISTS compliance_obligations_assignment_idx ON compliance_obligations(tenant_id,assigned_user_id,status,due_at);
