-- WORKSPACE AGENT / NODE-POSTGRES SCHEMA PROPOSAL — REVIEW ONLY.
-- NOT A MIGRATION. NEVER RUN AGAINST LIVE OR SHARED DATABASES.
-- This candidate is NOT referenced by db/migrations, application bootstrap or CI.
-- Isolated disposable PostgreSQL staging authorization and a dedicated migration
-- must be separately approved by owner and independent reviewer thusico.
--
-- Node tenant/user identifiers are UUID (see db/schema.sql).
-- Responsibility ID is an opaque text identifier (not a tenant/user ID).
-- Restricted read-only Agent endpoints use ONLY a parameterized SELECT.
--
CREATE TABLE agent_responsibilities (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL DEFAULT 'THEBE-001' CHECK (agent_id = 'THEBE-001'),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  objective TEXT NOT NULL CHECK (char_length(btrim(objective)) BETWEEN 1 AND 1200),
  workspace TEXT NOT NULL CHECK (
    workspace IN ('owner','finance','property','people','compliance','market','operations')
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft','active','paused','completed','cancelled')
  ),
  autonomy_ceiling INTEGER NOT NULL DEFAULT 1 CHECK (autonomy_ceiling BETWEEN 0 AND 2),
  schedule_kind TEXT NOT NULL DEFAULT 'manual' CHECK (
    schedule_kind IN ('manual','event','interval')
  ),
  schedule_spec TEXT,
  tool_scope_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tool_scope_json) = 'array'),
  data_scope_json JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(data_scope_json) = 'array'),
  budget_minor BIGINT CHECK (budget_minor IS NULL OR budget_minor >= 0),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_responsibility_schedule_valid CHECK (
    schedule_kind = 'manual' OR (schedule_spec IS NOT NULL AND char_length(btrim(schedule_spec)) > 0)
  ),
  CONSTRAINT agent_responsibility_activation_valid CHECK (
    status <> 'active' OR (activated_by_user_id IS NOT NULL AND activated_at IS NOT NULL)
  )
);

-- Matches WHERE tenant_id=$1 AND workspace=$2 AND status='active'
-- and ORDER BY updated_at DESC LIMIT 24 in private Node advisory endpoint.
CREATE INDEX idx_agent_responsibilities_scope
  ON agent_responsibilities (tenant_id, workspace, status, updated_at DESC);

-- No GRANT/REVOKE/ROLE changes in this candidate. A separately provisioned
-- staging SELECT-only role must be independently qualified before any reads.
-- No INSERT, UPDATE, DELETE, trigger, automatic task execution, route or cron
-- is defined or authorized by this review-only proposal.
