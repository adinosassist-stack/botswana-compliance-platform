-- DESIGN DRAFT ONLY. Never apply as a production migration without review.
-- Dispatch intents are nonexecuting records. A D1 batch must insert both intent
-- and audit; a failed audit insert must roll back the intent.
CREATE TABLE IF NOT EXISTS employee_dispatch_d1_intents (
 tenant_id TEXT NOT NULL,
 dispatch_id TEXT NOT NULL CHECK(length(dispatch_id) BETWEEN 16 AND 128),
 proposal_key TEXT NOT NULL CHECK(json_valid(proposal_key) AND json_array_length(proposal_key)=9),
 proposal_revision TEXT NOT NULL CHECK(length(proposal_revision)=64),
 workflow_revision TEXT NOT NULL CHECK(length(workflow_revision)=64),
 idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128),
 action TEXT NOT NULL CHECK(action IN ('internal.task.create','internal.report.draft')),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state='pending'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,dispatch_id),
 UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,proposal_key) REFERENCES employee_ai_proposal_provenance(tenant_id,proposal_key)
);
CREATE TABLE IF NOT EXISTS employee_dispatch_d1_audit (
 tenant_id TEXT NOT NULL,
 dispatch_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type='employee.dispatch.admitted'),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,dispatch_id,event_type),
 FOREIGN KEY(tenant_id,dispatch_id) REFERENCES employee_dispatch_d1_intents(tenant_id,dispatch_id)
);
-- Explicit tenant/intent audit binding; never rely on PRAGMA foreign_keys.
CREATE TRIGGER IF NOT EXISTS trg_dispatch_d1_audit_requires_intent
 BEFORE INSERT ON employee_dispatch_d1_audit
 WHEN NOT EXISTS (
  SELECT 1 FROM employee_dispatch_d1_intents i
  WHERE i.tenant_id=NEW.tenant_id AND i.dispatch_id=NEW.dispatch_id
 )
 BEGIN SELECT RAISE(ABORT,'dispatch_audit_requires_intent'); END;
CREATE TRIGGER IF NOT EXISTS trg_dispatch_d1_intent_immutable
 BEFORE UPDATE ON employee_dispatch_d1_intents BEGIN SELECT RAISE(ABORT,'dispatch_intent_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_dispatch_d1_intent_no_delete
 BEFORE DELETE ON employee_dispatch_d1_intents BEGIN SELECT RAISE(ABORT,'dispatch_intent_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_dispatch_d1_audit_immutable
 BEFORE UPDATE ON employee_dispatch_d1_audit BEGIN SELECT RAISE(ABORT,'dispatch_audit_immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_dispatch_d1_audit_no_delete
 BEFORE DELETE ON employee_dispatch_d1_audit BEGIN SELECT RAISE(ABORT,'dispatch_audit_immutable'); END;
-- REQUIRED BEFORE IMPLEMENTATION:
-- 1. Guarded INSERT ... SELECT must recheck canonical approved provenance SQL
--    and revisions within the same D1 batch as the audit INSERT.
-- 2. A failed audit INSERT must abort/roll back the entire batch.
-- 3. Concurrent duplicate idempotency keys must create one intent/audit pair.
-- 4. Separate owner approval is required before any runtime effect.
-- 5. Do not expose a worker/route or activate feature flags from this draft.
