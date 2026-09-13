-- V80 Stage 2: governed agentic observation and outcome measurement.
-- Outcomes are human-recorded measurements of proposal results.
-- This schema intentionally adds no executable action queue or autonomous side-effect capability.

CREATE TABLE IF NOT EXISTS agentic_outcomes(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL,
  outcome_status TEXT NOT NULL CHECK(outcome_status IN ('observed','improved','unchanged','worsened','resolved','not_applicable')),
  metric_key TEXT,
  baseline_json TEXT NOT NULL DEFAULT '{}',
  observed_json TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(proposal_id) REFERENCES agentic_proposals(id) ON DELETE CASCADE,
  FOREIGN KEY(recorded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agentic_outcomes_tenant_idx ON agentic_outcomes(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS agentic_outcomes_proposal_idx ON agentic_outcomes(tenant_id,proposal_id,created_at DESC);
CREATE INDEX IF NOT EXISTS agentic_outcomes_run_idx ON agentic_outcomes(tenant_id,run_id,created_at DESC);
