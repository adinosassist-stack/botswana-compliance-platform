-- V117 persistent Thebe responsibilities.
-- Persistent responsibilities are observation/decision records, never authority.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS agent_persistent_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  agent_key TEXT NOT NULL DEFAULT 'thebe' CHECK(agent_key='thebe'),
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('scheduled','event','manual')),
  trigger_spec_json TEXT NOT NULL DEFAULT '{}',
  allowed_tools_json TEXT NOT NULL DEFAULT '[]',
  risk_policy_json TEXT NOT NULL DEFAULT '{}',
  approval_policy_json TEXT NOT NULL DEFAULT '{}',
  budget_json TEXT NOT NULL DEFAULT '{}',
  checkpoint_json TEXT,
  last_verified_state_json TEXT,
  next_run_at TEXT,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_persistent_tasks_due
ON agent_persistent_tasks(tenant_id,status,next_run_at);

CREATE TABLE IF NOT EXISTS agent_persistent_task_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  persistent_task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(persistent_task_id) REFERENCES agent_persistent_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_persistent_task_events_task
ON agent_persistent_task_events(tenant_id,persistent_task_id,created_at);

CREATE TRIGGER IF NOT EXISTS agent_persistent_task_event_tenant_guard
BEFORE INSERT ON agent_persistent_task_events
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM agent_persistent_tasks t
    WHERE t.id=NEW.persistent_task_id AND t.tenant_id=NEW.tenant_id
  ) THEN RAISE(ABORT,'persistent_task_tenant_mismatch') END;
END;
