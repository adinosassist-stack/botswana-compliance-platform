-- V217: short-lived single-use JIT execution permits for the canonical Thebe agent.
-- This is an additional execution boundary. It does not replace delegation,
-- exact owner approval, canonical authority, Runtime Guard, kill switch, or verification.

CREATE TABLE IF NOT EXISTS agent_jit_execution_permits(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK(agent_id='THEBE-001'),
  human_user_id TEXT NOT NULL,
  task_request_id TEXT NOT NULL UNIQUE,
  execution_grant_id TEXT NOT NULL,
  action_key TEXT NOT NULL CHECK(action_key='task.create'),
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed')),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK(max_uses=1),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count BETWEEN 0 AND 1),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumed_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(datetime(expires_at) IS NOT NULL),
  CHECK(datetime(expires_at)>datetime(created_at)),
  CHECK(datetime(expires_at)<=datetime(created_at,'+5 minutes')),
  CHECK(
    (status='active' AND use_count=0 AND consumed_at IS NULL AND consumed_by_user_id IS NULL)
    OR
    (status='consumed' AND use_count=1 AND consumed_at IS NOT NULL AND consumed_by_user_id IS NOT NULL)
  ),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(human_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(task_request_id) REFERENCES agent_task_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(execution_grant_id) REFERENCES agent_execution_grants(id) ON DELETE RESTRICT,
  FOREIGN KEY(consumed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_jit_execution_permits_lookup_idx
  ON agent_jit_execution_permits(tenant_id,task_request_id,status,expires_at);

CREATE TRIGGER IF NOT EXISTS agent_jit_execution_permits_request_guard
BEFORE INSERT ON agent_jit_execution_permits
WHEN NOT EXISTS(
  SELECT 1
  FROM agent_task_requests q
  JOIN agent_action_intents i
    ON i.id=q.action_intent_id
   AND i.tenant_id=q.tenant_id
  JOIN agent_execution_grants g
    ON g.id=q.execution_grant_id
   AND g.tenant_id=q.tenant_id
  WHERE q.id=NEW.task_request_id
    AND q.tenant_id=NEW.tenant_id
    AND q.status='approved'
    AND q.approved_by_user_id=NEW.human_user_id
    AND q.approved_payload_hash=q.payload_hash
    AND q.payload_hash=NEW.payload_hash
    AND q.execution_grant_id=NEW.execution_grant_id
    AND g.status='active'
    AND i.agent_key='thebe'
    AND i.action_key=NEW.action_key
)
BEGIN
  SELECT RAISE(ABORT,'agent_jit_permit_request_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS agent_jit_execution_permits_consume_guard
BEFORE UPDATE ON agent_jit_execution_permits
WHEN
  OLD.status<>'active'
  OR OLD.use_count<>0
  OR NEW.status<>'consumed'
  OR NEW.use_count<>1
  OR NEW.id<>OLD.id
  OR NEW.tenant_id<>OLD.tenant_id
  OR NEW.agent_id<>OLD.agent_id
  OR NEW.human_user_id<>OLD.human_user_id
  OR NEW.task_request_id<>OLD.task_request_id
  OR NEW.execution_grant_id<>OLD.execution_grant_id
  OR NEW.action_key<>OLD.action_key
  OR NEW.payload_hash<>OLD.payload_hash
  OR NEW.expires_at<>OLD.expires_at
  OR NEW.created_at<>OLD.created_at
  OR NEW.consumed_at IS NULL
  OR NEW.consumed_by_user_id IS NULL
  OR NEW.consumed_by_user_id<>OLD.human_user_id
  OR datetime(OLD.expires_at)<=CURRENT_TIMESTAMP
BEGIN
  SELECT RAISE(ABORT,'agent_jit_permit_invalid_consume');
END;
