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
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_employee_dispatch_pending
  ON employee_dispatch_intents(state, created_at);
CREATE INDEX IF NOT EXISTS idx_employee_dispatch_proposal
  ON employee_dispatch_intents(tenant_id, proposal_id);

-- Audit and intent must be inserted in the same transaction.
CREATE TABLE IF NOT EXISTS employee_dispatch_audit (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('employee.dispatch.admitted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (intent_id) REFERENCES employee_dispatch_intents(id)
);
CREATE INDEX IF NOT EXISTS idx_employee_dispatch_audit_tenant
  ON employee_dispatch_audit(tenant_id, intent_id);
