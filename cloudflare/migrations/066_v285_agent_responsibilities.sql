-- V285: governed persistent responsibilities for the canonical Thebe agent.
-- Responsibilities describe durable owner intent. They do NOT grant execution authority.
-- Every side effect still requires the existing Runtime Guard, delegation, approval,
-- JIT permit, kill-switch, budget and verification controls.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS agent_responsibilities(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL DEFAULT 'THEBE-001' CHECK(agent_id='THEBE-001'),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  objective TEXT NOT NULL CHECK(length(trim(objective)) BETWEEN 1 AND 1200),
  workspace TEXT NOT NULL CHECK(workspace IN ('owner','finance','property','people','compliance','market','operations')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','completed','cancelled')),
  autonomy_ceiling INTEGER NOT NULL DEFAULT 1 CHECK(autonomy_ceiling BETWEEN 0 AND 2),
  schedule_kind TEXT NOT NULL DEFAULT 'manual' CHECK(schedule_kind IN ('manual','event','interval')),
  schedule_spec TEXT,
  tool_scope_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tool_scope_json)),
  data_scope_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(data_scope_json)),
  budget_minor INTEGER CHECK(budget_minor IS NULL OR budget_minor>=0),
  owner_user_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  activated_by_user_id TEXT,
  activated_at TEXT,
  paused_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(agent_id) REFERENCES agent_registry(agent_id) ON DELETE RESTRICT,
  CHECK(schedule_kind='manual' OR (schedule_spec IS NOT NULL AND length(trim(schedule_spec))>0)),
  CHECK((status='active' AND activated_by_user_id IS NOT NULL AND activated_at IS NOT NULL) OR status<>'active')
);

CREATE TABLE IF NOT EXISTS agent_responsibility_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  responsibility_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('CREATED','ACTIVATED','PAUSED','RESUMED','COMPLETED','CANCELLED','OBSERVED','PROPOSED_ACTION','POLICY_DENIED')),
  actor_type TEXT NOT NULL CHECK(actor_type IN ('human','agent','system')),
  actor_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  evidence_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(responsibility_id) REFERENCES agent_responsibilities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_responsibilities_tenant_status
  ON agent_responsibilities(tenant_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_responsibility_events_tenant_responsibility
  ON agent_responsibility_events(tenant_id,responsibility_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_agent_responsibility_no_authority_escalation
BEFORE UPDATE OF autonomy_ceiling,agent_id,tenant_id,owner_user_id ON agent_responsibilities
WHEN NEW.autonomy_ceiling>OLD.autonomy_ceiling
  OR NEW.agent_id<>OLD.agent_id
  OR NEW.tenant_id<>OLD.tenant_id
  OR NEW.owner_user_id<>OLD.owner_user_id
BEGIN
  SELECT RAISE(ABORT,'agent responsibility cannot escalate authority');
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_responsibility_terminal
BEFORE UPDATE OF status ON agent_responsibilities
WHEN OLD.status IN ('completed','cancelled') AND NEW.status<>OLD.status
BEGIN
  SELECT RAISE(ABORT,'terminal responsibility cannot be reopened');
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_responsibility_scope_required
BEFORE UPDATE OF status ON agent_responsibilities
WHEN NEW.status='active' AND (
  NEW.activated_by_user_id IS NULL OR NEW.activated_at IS NULL
  OR json_type(NEW.tool_scope_json)<>'array'
  OR json_type(NEW.data_scope_json)<>'array'
)
BEGIN
  SELECT RAISE(ABORT,'active responsibility requires explicit owner activation and bounded scopes');
END;
