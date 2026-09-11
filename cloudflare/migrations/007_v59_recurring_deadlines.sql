
ALTER TABLE compliance_obligations ADD COLUMN period_key TEXT;
ALTER TABLE compliance_obligations ADD COLUMN period_start TEXT;
ALTER TABLE compliance_obligations ADD COLUMN period_end TEXT;
ALTER TABLE compliance_obligations ADD COLUMN schedule_type TEXT;
ALTER TABLE compliance_obligations ADD COLUMN deadline_basis_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE compliance_obligations ADD COLUMN generated_by_run_id TEXT;
CREATE INDEX IF NOT EXISTS compliance_obligations_period_idx ON compliance_obligations(tenant_id,rule_id,period_key,due_at);
CREATE TABLE IF NOT EXISTS statutory_deadline_runs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_type IN ('manual','scheduled','profile_change','rule_rollout')),status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','partial','failed')),rules_evaluated INTEGER NOT NULL DEFAULT 0,obligations_created INTEGER NOT NULL DEFAULT 0,schedules_needing_input INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,error_summary TEXT,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS statutory_deadline_runs_tenant_idx ON statutory_deadline_runs(tenant_id,started_at DESC);
CREATE TABLE IF NOT EXISTS statutory_schedule_status(tenant_id TEXT NOT NULL,rule_id TEXT NOT NULL,schedule_type TEXT NOT NULL,config_status TEXT NOT NULL CHECK(config_status IN ('ready','needs_input','not_applicable','unsupported')),missing_fields_json TEXT NOT NULL DEFAULT '[]',next_due_at TEXT,last_generated_at TEXT,details_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(tenant_id,rule_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS statutory_schedule_status_idx ON statutory_schedule_status(tenant_id,config_status,next_due_at);
CREATE TABLE IF NOT EXISTS statutory_scheduler_state(state_key TEXT PRIMARY KEY,state_value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
