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
