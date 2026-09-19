-- V102 Stage 2: first bounded internal agent execution surface.
-- Existing agent_delegations remains permanently shadow-only. Real execution is
-- granted separately, action-by-action, and only task.create is eligible here.

CREATE TABLE IF NOT EXISTS agent_execution_grants(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  delegation_id TEXT NOT NULL UNIQUE,
  action_key TEXT NOT NULL CHECK(action_key='task.create'),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  approved_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(delegation_id) REFERENCES agent_delegations(id) ON DELETE CASCADE,
  FOREIGN KEY(approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_execution_grants_lookup_idx
  ON agent_execution_grants(tenant_id,action_key,status,created_at DESC);

CREATE TRIGGER IF NOT EXISTS agent_execution_grants_delegation_guard
BEFORE INSERT ON agent_execution_grants
WHEN NOT EXISTS(
  SELECT 1 FROM agent_delegations d
  WHERE d.id=NEW.delegation_id
    AND d.tenant_id=NEW.tenant_id
    AND d.agent_key='thebe'
    AND d.action_key=NEW.action_key
    AND d.status='active'
    AND d.max_autonomy_level>=3
    AND d.external_side_effects=0
    AND d.human_confirmation_required=1
    AND (d.valid_from IS NULL OR d.valid_from<=CURRENT_TIMESTAMP)
    AND (d.expires_at IS NULL OR d.expires_at>CURRENT_TIMESTAMP)
)
BEGIN
  SELECT RAISE(ABORT,'agent_execution_grant_invalid_delegation');
END;

CREATE TABLE IF NOT EXISTS agent_task_requests(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  action_intent_id TEXT NOT NULL UNIQUE,
  delegation_id TEXT NOT NULL,
  execution_grant_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK(status IN ('prepared','approved','executed','cancelled')),
  approved_payload_hash TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(action_intent_id) REFERENCES agent_action_intents(id) ON DELETE CASCADE,
  FOREIGN KEY(delegation_id) REFERENCES agent_delegations(id) ON DELETE RESTRICT,
  FOREIGN KEY(execution_grant_id) REFERENCES agent_execution_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_task_requests_tenant_idx
  ON agent_task_requests(tenant_id,status,created_at DESC);

CREATE TRIGGER IF NOT EXISTS agent_task_requests_intent_guard
BEFORE INSERT ON agent_task_requests
WHEN NOT EXISTS(
  SELECT 1 FROM agent_action_intents i
  WHERE i.id=NEW.action_intent_id
    AND i.tenant_id=NEW.tenant_id
    AND i.agent_key='thebe'
    AND i.action_key='task.create'
    AND i.delegation_id=NEW.delegation_id
    AND i.payload_hash=NEW.payload_hash
    AND i.decision='review_required'
    AND i.status='review_required'
)
BEGIN
  SELECT RAISE(ABORT,'agent_task_request_intent_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS agent_task_requests_grant_guard
BEFORE INSERT ON agent_task_requests
WHEN NOT EXISTS(
  SELECT 1 FROM agent_execution_grants g
  WHERE g.id=NEW.execution_grant_id
    AND g.tenant_id=NEW.tenant_id
    AND g.delegation_id=NEW.delegation_id
    AND g.action_key='task.create'
    AND g.status='active'
)
BEGIN
  SELECT RAISE(ABORT,'agent_task_request_execution_grant_mismatch');
END;

CREATE TABLE IF NOT EXISTS agent_internal_tasks(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','cancelled')),
  source_request_id TEXT NOT NULL UNIQUE,
  source_intent_id TEXT NOT NULL UNIQUE,
  execution_grant_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  created_by_agent_key TEXT NOT NULL DEFAULT 'thebe' CHECK(created_by_agent_key='thebe'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(source_request_id) REFERENCES agent_task_requests(id) ON DELETE RESTRICT,
  FOREIGN KEY(source_intent_id) REFERENCES agent_action_intents(id) ON DELETE RESTRICT,
  FOREIGN KEY(execution_grant_id) REFERENCES agent_execution_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_internal_tasks_tenant_idx
  ON agent_internal_tasks(tenant_id,status,priority,due_at,created_at DESC);

CREATE TABLE IF NOT EXISTS agent_execution_receipts(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  action_intent_id TEXT NOT NULL UNIQUE,
  execution_grant_id TEXT NOT NULL,
  action_key TEXT NOT NULL CHECK(action_key='task.create'),
  payload_hash TEXT NOT NULL,
  result_entity_type TEXT NOT NULL CHECK(result_entity_type='agent_internal_task'),
  result_entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK(status='succeeded'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(action_intent_id) REFERENCES agent_action_intents(id) ON DELETE RESTRICT,
  FOREIGN KEY(execution_grant_id) REFERENCES agent_execution_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY(result_entity_id) REFERENCES agent_internal_tasks(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_execution_receipts_tenant_idx
  ON agent_execution_receipts(tenant_id,action_key,created_at DESC);

CREATE TRIGGER IF NOT EXISTS agent_execution_receipts_tenant_guard
BEFORE INSERT ON agent_execution_receipts
WHEN NOT EXISTS(
  SELECT 1 FROM agent_action_intents i
  WHERE i.id=NEW.action_intent_id
    AND i.tenant_id=NEW.tenant_id
    AND i.action_key=NEW.action_key
    AND i.payload_hash=NEW.payload_hash
)
OR NOT EXISTS(
  SELECT 1 FROM agent_execution_grants g
  WHERE g.id=NEW.execution_grant_id
    AND g.tenant_id=NEW.tenant_id
    AND g.action_key=NEW.action_key
    AND g.status='active'
)
OR NOT EXISTS(
  SELECT 1 FROM agent_internal_tasks t
  WHERE t.id=NEW.result_entity_id
    AND t.tenant_id=NEW.tenant_id
    AND t.source_intent_id=NEW.action_intent_id
    AND t.execution_grant_id=NEW.execution_grant_id
)
BEGIN
  SELECT RAISE(ABORT,'agent_execution_receipt_authority_mismatch');
END;
