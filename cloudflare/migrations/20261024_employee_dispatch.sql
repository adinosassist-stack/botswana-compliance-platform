-- Default-off D1 employee dispatcher. Creates no grants, queues or enabled controls.
CREATE TABLE IF NOT EXISTS employee_dispatch_controls(
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 stopped INTEGER NOT NULL DEFAULT 1 CHECK(stopped IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE IF NOT EXISTS employee_dispatch_queue(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL REFERENCES agent_task_requests(id) ON DELETE CASCADE,
 proposal_key TEXT NOT NULL,
 permit_id TEXT NOT NULL REFERENCES agent_jit_execution_permits(id) ON DELETE CASCADE,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','committing','completed','dead_letter')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 available_at INTEGER NOT NULL DEFAULT (unixepoch()),
 lease_token TEXT,
 lease_until INTEGER,
 result_task_id TEXT REFERENCES agent_internal_tasks(id) ON DELETE CASCADE,
 last_error TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,request_id),
 CHECK((state IN ('leased','committing') AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND attempts>0)
   OR (state IN ('queued','completed','dead_letter') AND lease_token IS NULL AND lease_until IS NULL)),
 CHECK((state='completed' AND result_task_id IS NOT NULL) OR (state<>'completed' AND result_task_id IS NULL))
);
CREATE INDEX IF NOT EXISTS employee_dispatch_due ON employee_dispatch_queue(state,available_at,lease_until);
CREATE TRIGGER IF NOT EXISTS employee_dispatch_binding_immutable
BEFORE UPDATE ON employee_dispatch_queue
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.request_id<>OLD.request_id
 OR NEW.proposal_key<>OLD.proposal_key OR NEW.permit_id<>OLD.permit_id OR NEW.owner_id<>OLD.owner_id
 OR NEW.session_hash<>OLD.session_hash OR NEW.created_at<>OLD.created_at
 OR OLD.state IN ('completed','dead_letter')
BEGIN SELECT RAISE(ABORT,'employee_dispatch_binding_immutable'); END;
CREATE TRIGGER IF NOT EXISTS employee_dispatch_execution_guard
BEFORE UPDATE OF status ON agent_task_requests
WHEN NEW.status='executed' AND EXISTS(SELECT 1 FROM employee_dispatch_queue WHERE tenant_id=NEW.tenant_id AND request_id=NEW.id)
 AND NOT EXISTS(SELECT 1 FROM employee_dispatch_queue dq JOIN employee_dispatch_controls dc ON dc.tenant_id=dq.tenant_id
  WHERE dq.tenant_id=NEW.tenant_id AND dq.request_id=NEW.id AND dq.state='committing'
   AND dq.lease_until>unixepoch() AND dc.enabled=1 AND dc.stopped=0 AND dq.permit_id=NEW.jit_permit_id)
BEGIN SELECT RAISE(ABORT,'employee_dispatch_fence_required'); END;
CREATE TRIGGER IF NOT EXISTS employee_dispatch_completion_guard
BEFORE UPDATE OF state ON employee_dispatch_queue WHEN NEW.state='completed'
BEGIN
 SELECT CASE WHEN OLD.state<>'committing' OR OLD.lease_until<=unixepoch()
  OR NOT EXISTS(SELECT 1 FROM employee_dispatch_controls WHERE tenant_id=NEW.tenant_id AND enabled=1 AND stopped=0)
  OR NOT EXISTS(SELECT 1 FROM agent_task_requests q
   JOIN agent_internal_tasks t ON t.source_request_id=q.id AND t.tenant_id=q.tenant_id
   JOIN agent_execution_receipts r ON r.result_entity_id=t.id AND r.tenant_id=t.tenant_id AND r.action_intent_id=q.action_intent_id
   JOIN audit_events a ON a.entity_id=t.id AND a.tenant_id=t.tenant_id AND a.event_type='AGENT_TASK_EXECUTED'
   WHERE q.id=NEW.request_id AND q.tenant_id=NEW.tenant_id AND q.status='executed' AND q.jit_permit_id=NEW.permit_id
    AND t.id=NEW.result_task_id AND r.status='succeeded')
  THEN RAISE(ABORT,'employee_dispatch_atomic_completion_required') END;
END;
CREATE TRIGGER IF NOT EXISTS employee_dispatch_insert_audit AFTER INSERT ON employee_dispatch_queue
BEGIN
 INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
 VALUES(NEW.tenant_id,NEW.owner_id,'EMPLOYEE_DISPATCH_TRANSITION','employee_dispatch',NEW.id,
  json_object('requestId',NEW.request_id,'state',NEW.state,'attempts',NEW.attempts));
END;
CREATE TRIGGER IF NOT EXISTS employee_dispatch_update_audit AFTER UPDATE ON employee_dispatch_queue
BEGIN
 INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
 VALUES(NEW.tenant_id,NEW.owner_id,'EMPLOYEE_DISPATCH_TRANSITION','employee_dispatch',NEW.id,
  json_object('requestId',NEW.request_id,'previousState',OLD.state,'state',NEW.state,'attempts',NEW.attempts,'error',NEW.last_error));
END;
CREATE TRIGGER IF NOT EXISTS employee_dispatch_control_revision BEFORE UPDATE ON employee_dispatch_controls
WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'employee_dispatch_control_revision'); END;
CREATE TRIGGER IF NOT EXISTS employee_dispatch_control_insert_audit AFTER INSERT ON employee_dispatch_controls
BEGIN
 INSERT INTO audit_events(tenant_id,event_type,entity_type,entity_id,event_data)
 VALUES(NEW.tenant_id,'EMPLOYEE_DISPATCH_CONTROL','employee_dispatch_controls',NEW.tenant_id,
  json_object('enabled',NEW.enabled,'stopped',NEW.stopped,'revision',NEW.revision));
END;
CREATE TRIGGER IF NOT EXISTS employee_dispatch_control_update_audit AFTER UPDATE ON employee_dispatch_controls
BEGIN
 INSERT INTO audit_events(tenant_id,event_type,entity_type,entity_id,event_data)
 VALUES(NEW.tenant_id,'EMPLOYEE_DISPATCH_CONTROL','employee_dispatch_controls',NEW.tenant_id,
  json_object('enabled',NEW.enabled,'stopped',NEW.stopped,'revision',NEW.revision));
END;
