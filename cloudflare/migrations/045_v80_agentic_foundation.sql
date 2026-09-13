-- V80 Stage 1: governed agentic planning foundation.
-- This schema stores observations, recommendations and human decisions only.
-- It intentionally contains no executable side-effect queue.

CREATE TABLE IF NOT EXISTS agentic_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  generation_mode TEXT NOT NULL CHECK(generation_mode IN ('governed_ai_advisor','deterministic_fallback')),
  confidence TEXT NOT NULL CHECK(confidence IN ('low','medium','high')),
  observation_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agentic_runs_tenant_idx ON agentic_runs(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS agentic_proposals(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal>=1 AND ordinal<=8),
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  risk TEXT NOT NULL CHECK(risk IN ('low','medium','high')),
  authority TEXT NOT NULL CHECK(authority IN ('recommendation_only','approval_required','human_only')),
  execution_policy TEXT NOT NULL CHECK(execution_policy IN ('not_executable_stage_1','prohibited_autonomy')),
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  decided_by_user_id TEXT,
  decision_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,run_id,ordinal),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS agentic_proposals_tenant_idx ON agentic_proposals(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS agentic_proposals_run_idx ON agentic_proposals(tenant_id,run_id,ordinal);

CREATE TABLE IF NOT EXISTS agentic_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  proposal_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('PLAN_GENERATED','PROPOSAL_APPROVED','PROPOSAL_REJECTED')),
  actor_user_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(proposal_id) REFERENCES agentic_proposals(id) ON DELETE SET NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agentic_events_tenant_idx ON agentic_events(tenant_id,occurred_at DESC);
