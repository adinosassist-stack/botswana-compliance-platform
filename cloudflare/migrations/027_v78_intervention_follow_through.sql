ALTER TABLE executive_exception_interventions ADD COLUMN progress_status TEXT NOT NULL DEFAULT 'not_started' CHECK(progress_status IN ('not_started','on_track','at_risk','blocked'));
ALTER TABLE executive_exception_interventions ADD COLUMN progress_note TEXT;
ALTER TABLE executive_exception_interventions ADD COLUMN progress_updated_at TEXT;
ALTER TABLE executive_exception_interventions ADD COLUMN progress_updated_by_user_id TEXT;
CREATE INDEX IF NOT EXISTS executive_exception_interventions_followup_idx
ON executive_exception_interventions(tenant_id,status,recovery_due_at,progress_updated_at,progress_status);
