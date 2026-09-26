-- V149: canonical agent identity registry and universal authority state.
-- Control-plane only: this migration grants no execution authority.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','system_observer')),
  purpose TEXT NOT NULL,
  risk_tier TEXT NOT NULL CHECK(risk_tier IN ('low','medium','high')),
  authority_state TEXT NOT NULL DEFAULT 'restricted'
    CHECK(authority_state IN ('active','restricted','suspended','revoked')),
  execution_capable INTEGER NOT NULL DEFAULT 0 CHECK(execution_capable IN (0,1)),
  owner_scope TEXT NOT NULL DEFAULT 'platform',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_authority_change_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_authority_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  previous_state TEXT CHECK(previous_state IS NULL OR previous_state IN ('active','restricted','suspended','revoked')),
  new_state TEXT NOT NULL CHECK(new_state IN ('active','restricted','suspended','revoked')),
  reason_code TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('owner','platform_admin','system')),
  actor_id TEXT,
  evidence_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(agent_id) REFERENCES agent_registry(agent_id)
);

CREATE TABLE IF NOT EXISTS agent_authority_drift_findings (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  finding_type TEXT NOT NULL,
  expected_hash TEXT NOT NULL,
  effective_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(agent_id) REFERENCES agent_registry(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_authority_events_agent_created
  ON agent_authority_events(agent_id,created_at);
CREATE INDEX IF NOT EXISTS idx_agent_authority_drift_open
  ON agent_authority_drift_findings(agent_id,status,detected_at);

INSERT OR IGNORE INTO agent_registry(
  agent_id,canonical_name,actor_type,purpose,risk_tier,authority_state,execution_capable,owner_scope
) VALUES
  ('THEBE-001','thebe','agent','Canonical Thebe Super Agent','high','restricted',0,'platform'),
  ('SYS-FIN-OBS-001','system_observer','system_observer','Governed read-only Finance observation','low','restricted',0,'platform');

CREATE TRIGGER IF NOT EXISTS trg_agent_registry_no_execution_escalation
BEFORE UPDATE OF execution_capable ON agent_registry
WHEN NEW.execution_capable > OLD.execution_capable
BEGIN
  SELECT RAISE(ABORT,'agent registry cannot grant execution authority');
END;

CREATE TRIGGER IF NOT EXISTS trg_agent_registry_revoked_terminal
BEFORE UPDATE OF authority_state ON agent_registry
WHEN OLD.authority_state='revoked' AND NEW.authority_state<>'revoked'
BEGIN
  SELECT RAISE(ABORT,'revoked agent identity is terminal');
END;
