-- Proposed durable employee dispatch outbox, NOT applied to production.
-- The adapter must transact proposal/review reads, locking, insert and audit.
CREATE TABLE IF NOT EXISTS employee_dispatch_intents (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('internal.task.create', 'internal.report.draft')),
  intent_type TEXT NOT NULL CHECK (intent_type IN ('task', 'report')),
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','leased','completed','failed','dead_letter')),
  max_attempts INTEGER NOT NULL DEFAULT 3
    CHECK (typeof(max_attempts) = 'integer' AND max_attempts BETWEEN 1 AND 10),
  attempts INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(attempts) = 'integer' AND attempts BETWEEN 0 AND max_attempts),
  lease_token TEXT,
  lease_expires_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (lease_token),
  CHECK (
    (state = 'leased' AND lease_token IS NOT NULL AND length(lease_token) > 0
      AND typeof(lease_expires_at) = 'integer' AND attempts >= 1)
    OR (state <> 'leased' AND lease_token IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_employee_dispatch_pending
  ON employee_dispatch_intents(state, created_at);
CREATE INDEX IF NOT EXISTS idx_employee_dispatch_proposal
  ON employee_dispatch_intents(tenant_id, proposal_id);
CREATE INDEX IF NOT EXISTS idx_employee_dispatch_tenant_lease
  ON employee_dispatch_intents(tenant_id, state, lease_expires_at, created_at);

-- Audit and intent must be inserted in the same transaction.
CREATE TABLE IF NOT EXISTS employee_dispatch_audit (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'employee.dispatch.admitted','employee.dispatch.leased',
    'employee.dispatch.completed','employee.dispatch.retry',
    'employee.dispatch.dead_letter'
  )),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (intent_id) REFERENCES employee_dispatch_intents(id)
);
CREATE INDEX IF NOT EXISTS idx_employee_dispatch_audit_tenant
  ON employee_dispatch_audit(tenant_id, intent_id);

-- Tenant/intent relationship is enforced by the compound foreign key.
-- Existing installations must use a reviewed migration, not replay this draft.
CREATE TRIGGER IF NOT EXISTS trg_employee_dispatch_audit_tenant
BEFORE INSERT ON employee_dispatch_audit
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM employee_dispatch_intents
  WHERE id = NEW.intent_id AND tenant_id = NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT, 'employee_dispatch_audit_tenant_mismatch');
END;

-- Audit entries are immutable: correction requires an additional event.
CREATE TRIGGER IF NOT EXISTS trg_employee_dispatch_audit_no_update
BEFORE UPDATE ON employee_dispatch_audit
BEGIN
  SELECT RAISE(ABORT, 'employee_dispatch_audit_immutable');
END;
CREATE TRIGGER IF NOT EXISTS trg_employee_dispatch_audit_no_delete
BEFORE DELETE ON employee_dispatch_audit
BEGIN
  SELECT RAISE(ABORT, 'employee_dispatch_audit_immutable');
END;
