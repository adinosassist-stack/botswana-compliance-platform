-- v78 1.21.38 — management accountability effectiveness.
-- Counters describe intervention execution patterns, not employee performance scores.
ALTER TABLE executive_exception_interventions ADD COLUMN recovery_extension_count INTEGER NOT NULL DEFAULT 0 CHECK(recovery_extension_count>=0);
ALTER TABLE executive_exception_interventions ADD COLUMN blocked_checkpoint_count INTEGER NOT NULL DEFAULT 0 CHECK(blocked_checkpoint_count>=0);
ALTER TABLE executive_exception_interventions ADD COLUMN at_risk_checkpoint_count INTEGER NOT NULL DEFAULT 0 CHECK(at_risk_checkpoint_count>=0);
ALTER TABLE executive_exception_interventions ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0 CHECK(reopen_count>=0);
ALTER TABLE executive_exception_interventions ADD COLUMN missed_recovery_count INTEGER NOT NULL DEFAULT 0 CHECK(missed_recovery_count>=0);
ALTER TABLE executive_exception_interventions ADD COLUMN last_missed_recovery_due_at TEXT;
ALTER TABLE executive_exception_interventions ADD COLUMN last_recovery_extended_at TEXT;
CREATE INDEX IF NOT EXISTS executive_exception_interventions_accountability_idx
ON executive_exception_interventions(tenant_id,updated_at,recovery_extension_count,blocked_checkpoint_count,reopen_count,missed_recovery_count);
