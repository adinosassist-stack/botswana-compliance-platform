-- Agent cost accounting foundation. No autonomous execution is enabled by this migration.
CREATE TABLE IF NOT EXISTS agent_cost_budgets (
 tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 budget_minor INTEGER NOT NULL CHECK(budget_minor>=0),
 spent_minor INTEGER NOT NULL DEFAULT 0 CHECK(spent_minor>=0),
 reserved_minor INTEGER NOT NULL DEFAULT 0 CHECK(reserved_minor>=0),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN(0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,agent_id),
 CHECK(spent_minor+reserved_minor<=budget_minor)
);
CREATE TABLE IF NOT EXISTS agent_cost_reservations (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 run_id TEXT NOT NULL, estimate_minor INTEGER NOT NULL CHECK(estimate_minor>=0),
 actual_minor INTEGER CHECK(actual_minor IS NULL OR actual_minor>=0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','settled','released')),
 provider TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 settled_at TEXT,
 UNIQUE(tenant_id,agent_id,run_id),
 FOREIGN KEY(tenant_id,agent_id) REFERENCES agent_cost_budgets(tenant_id,agent_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_cost_reservations_tenant_status ON agent_cost_reservations(tenant_id,agent_id,status);

-- Append-only lifecycle ledger for operator reconciliation. A failed insert must
-- roll back its paired reservation/budget mutation in the same D1 batch.
CREATE TABLE IF NOT EXISTS agent_cost_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 reservation_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 agent_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('reserved','settled','released')),
 estimate_minor INTEGER NOT NULL CHECK(estimate_minor>=0),
 actual_minor INTEGER CHECK(actual_minor IS NULL OR actual_minor>=0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(reservation_id,event_type),
 FOREIGN KEY(reservation_id) REFERENCES agent_cost_reservations(id)
);
CREATE INDEX IF NOT EXISTS idx_agent_cost_events_tenant_created ON agent_cost_events(tenant_id,agent_id,created_at);

-- Database-level invariant: reservation transitions and budget accounting must
-- not be separable by callers. These triggers reject invalid lifecycle changes.
CREATE TRIGGER IF NOT EXISTS agent_cost_budget_immutable_keys
BEFORE UPDATE OF tenant_id,agent_id ON agent_cost_budgets
BEGIN SELECT RAISE(ABORT,'cost_budget_identity_immutable'); END;
CREATE TRIGGER IF NOT EXISTS agent_cost_reservation_immutable
BEFORE UPDATE OF id,tenant_id,agent_id,run_id,estimate_minor ON agent_cost_reservations
BEGIN SELECT RAISE(ABORT,'cost_reservation_identity_immutable'); END;
CREATE TRIGGER IF NOT EXISTS agent_cost_reservation_no_delete
BEFORE DELETE ON agent_cost_reservations
BEGIN SELECT RAISE(ABORT,'cost_reservation_delete_forbidden'); END;
CREATE TRIGGER IF NOT EXISTS agent_cost_events_no_update
BEFORE UPDATE ON agent_cost_events
BEGIN SELECT RAISE(ABORT,'cost_event_immutable'); END;
CREATE TRIGGER IF NOT EXISTS agent_cost_events_no_delete
BEFORE DELETE ON agent_cost_events
BEGIN SELECT RAISE(ABORT,'cost_event_delete_forbidden'); END;

-- Enforce atomic budget movement from inside the reservation statement.
-- Unlike checking batch metadata after COMMIT, a rejected transition aborts
-- the entire statement and its accounting mutation.
CREATE TRIGGER IF NOT EXISTS agent_cost_reserve_budget
AFTER INSERT ON agent_cost_reservations
BEGIN
 UPDATE agent_cost_budgets
 SET reserved_minor=reserved_minor+NEW.estimate_minor,updated_at=CURRENT_TIMESTAMP
 WHERE tenant_id=NEW.tenant_id AND agent_id=NEW.agent_id
   AND enabled=1 AND suspended=0
   AND spent_minor+reserved_minor+NEW.estimate_minor<=budget_minor;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'cost_reservation_budget_rejected') END;
END;
CREATE TRIGGER IF NOT EXISTS agent_cost_settle_budget
AFTER UPDATE OF status ON agent_cost_reservations
WHEN NEW.status='settled' AND OLD.status='reserved'
BEGIN
 UPDATE agent_cost_budgets
 SET reserved_minor=reserved_minor-OLD.estimate_minor,
     spent_minor=spent_minor+NEW.actual_minor,updated_at=CURRENT_TIMESTAMP
 WHERE tenant_id=OLD.tenant_id AND agent_id=OLD.agent_id
   AND NEW.actual_minor IS NOT NULL
   AND reserved_minor>=OLD.estimate_minor
   AND spent_minor+reserved_minor-OLD.estimate_minor+NEW.actual_minor<=budget_minor;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'cost_settlement_budget_rejected') END;
END;
CREATE TRIGGER IF NOT EXISTS agent_cost_release_budget
AFTER UPDATE OF status ON agent_cost_reservations
WHEN NEW.status='released' AND OLD.status='reserved'
BEGIN
 UPDATE agent_cost_budgets
 SET reserved_minor=reserved_minor-OLD.estimate_minor,updated_at=CURRENT_TIMESTAMP
 WHERE tenant_id=OLD.tenant_id AND agent_id=OLD.agent_id
   AND reserved_minor>=OLD.estimate_minor;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'cost_release_budget_rejected') END;
END;
CREATE TRIGGER IF NOT EXISTS agent_cost_no_invalid_transition
BEFORE UPDATE OF status ON agent_cost_reservations
WHEN OLD.status!='reserved' OR NEW.status NOT IN ('settled','released')
BEGIN SELECT RAISE(ABORT,'cost_invalid_transition'); END;
