-- V81 Stage 1.5: delegated authority in shadow mode only.
-- This migration deliberately creates no executable action queue and no route
-- may perform an external side effect from these tables. A future migration is
-- required before any bounded execution can be enabled.

CREATE TABLE IF NOT EXISTS agent_delegations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','revoked','expired')),
  max_autonomy_level INTEGER NOT NULL CHECK(max_autonomy_level BETWEEN 0 AND 3),
  external_side_effects INTEGER NOT NULL DEFAULT 0 CHECK(external_side_effects IN (0,1)),
  strong_auth_required INTEGER NOT NULL DEFAULT 0 CHECK(strong_auth_required IN (0,1)),
  human_confirmation_required INTEGER NOT NULL DEFAULT 1 CHECK(human_confirmation_required IN (0,1)),
  max_daily_actions INTEGER CHECK(max_daily_actions IS NULL OR (max_daily_actions>=1 AND max_daily_actions<=1000)),
  max_amount_minor INTEGER CHECK(max_amount_minor IS NULL OR max_amount_minor>=0),
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK(shadow_only=1),
  valid_from TEXT,
  expires_at TEXT,
  created_by_user_id TEXT NOT NULL,
  approved_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(approved_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_delegations_lookup_idx
  ON agent_delegations(tenant_id,agent_key,action_key,status,created_at DESC);
CREATE INDEX IF NOT EXISTS agent_delegations_expiry_idx
  ON agent_delegations(tenant_id,status,expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS agent_delegations_one_active_idx
  ON agent_delegations(tenant_id,agent_key,action_key) WHERE status='active';

CREATE TABLE IF NOT EXISTS agent_action_intents(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT,
  proposal_id TEXT,
  agent_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  delegation_id TEXT,
  mode TEXT NOT NULL DEFAULT 'shadow' CHECK(mode='shadow'),
  decision TEXT NOT NULL CHECK(decision IN ('shadow_allow','deny','review_required','human_only','policy_allow')),
  decision_code TEXT NOT NULL,
  required_autonomy_level INTEGER NOT NULL CHECK(required_autonomy_level BETWEEN 0 AND 4),
  amount_minor INTEGER NOT NULL DEFAULT 0 CHECK(amount_minor>=0),
  payload_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('evaluated','blocked','review_required','ready')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE SET NULL,
  FOREIGN KEY(proposal_id) REFERENCES agentic_proposals(id) ON DELETE SET NULL,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(delegation_id) REFERENCES agent_delegations(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS agent_action_intents_tenant_idx
  ON agent_action_intents(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS agent_action_intents_action_idx
  ON agent_action_intents(tenant_id,agent_key,action_key,created_at DESC);

-- Optional links back to a run/proposal must remain in the same tenant. The
-- primary-key foreign keys alone cannot express that invariant, so D1 enforces
-- it with fail-closed triggers.
CREATE TRIGGER IF NOT EXISTS agent_action_intents_run_tenant_guard
BEFORE INSERT ON agent_action_intents
WHEN NEW.run_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM agentic_runs r WHERE r.id=NEW.run_id AND r.tenant_id=NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT,'agentic_run_tenant_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS agent_action_intents_proposal_tenant_guard
BEFORE INSERT ON agent_action_intents
WHEN NEW.proposal_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM agentic_proposals p WHERE p.id=NEW.proposal_id AND p.tenant_id=NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT,'agentic_proposal_tenant_mismatch');
END;

CREATE TRIGGER IF NOT EXISTS agent_action_intents_delegation_tenant_guard
BEFORE INSERT ON agent_action_intents
WHEN NEW.delegation_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM agent_delegations d WHERE d.id=NEW.delegation_id AND d.tenant_id=NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT,'agentic_delegation_tenant_mismatch');
END;

CREATE TABLE IF NOT EXISTS agent_delegation_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  delegation_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('CREATED','PAUSED','REVOKED','SHADOW_EVALUATED')),
  actor_user_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(delegation_id) REFERENCES agent_delegations(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS agent_delegation_events_tenant_guard
BEFORE INSERT ON agent_delegation_events
WHEN NOT EXISTS(
  SELECT 1 FROM agent_delegations d WHERE d.id=NEW.delegation_id AND d.tenant_id=NEW.tenant_id
)
BEGIN
  SELECT RAISE(ABORT,'agentic_delegation_event_tenant_mismatch');
END;

CREATE INDEX IF NOT EXISTS agent_delegation_events_idx
  ON agent_delegation_events(tenant_id,delegation_id,created_at DESC);
