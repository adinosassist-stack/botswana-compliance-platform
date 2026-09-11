ALTER TABLE obligation_escalations ADD COLUMN acknowledged_by_user_id TEXT;
ALTER TABLE obligation_escalations ADD COLUMN acknowledgement_note TEXT;
ALTER TABLE obligation_escalations ADD COLUMN response_due_at TEXT;
ALTER TABLE obligation_escalations ADD COLUMN resolved_by_user_id TEXT;
ALTER TABLE obligation_escalations ADD COLUMN resolution_note TEXT;
ALTER TABLE obligation_escalations ADD COLUMN resolution_basis TEXT;
CREATE INDEX IF NOT EXISTS obligation_escalations_response_idx ON obligation_escalations(tenant_id,status,response_due_at,escalation_level);
