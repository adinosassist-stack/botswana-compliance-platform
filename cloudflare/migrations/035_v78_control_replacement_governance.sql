-- v78 1.21.45 — control replacement governance.
-- Weak preventive controls require a documented retirement/replacement plan and proof that the old control is no longer relied upon.
CREATE TABLE IF NOT EXISTS executive_control_replacement_governance(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  preventive_pattern_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','retired','verified')),
  retired_control TEXT NOT NULL,
  replacement_control TEXT NOT NULL,
  stronger_reason TEXT NOT NULL,
  transition_risk TEXT NOT NULL,
  transition_mitigation TEXT NOT NULL,
  owner_user_id TEXT,
  owner_name_snapshot TEXT NOT NULL,
  implementation_due_at TEXT NOT NULL,
  replacement_corrective_action_id TEXT,
  retirement_evidence TEXT,
  retirement_note TEXT,
  retired_at TEXT,
  retired_by_user_id TEXT,
  verified_at TEXT,
  verified_by_user_id TEXT,
  opened_by_user_id TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(preventive_pattern_id) REFERENCES executive_control_preventive_patterns(id) ON DELETE CASCADE,
  FOREIGN KEY(intervention_id) REFERENCES executive_exception_interventions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(replacement_corrective_action_id) REFERENCES executive_corrective_actions(id) ON DELETE SET NULL,
  FOREIGN KEY(retired_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(opened_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS executive_control_replacement_governance_active_idx
ON executive_control_replacement_governance(tenant_id,preventive_pattern_id) WHERE status IN ('planned','retired');
CREATE INDEX IF NOT EXISTS executive_control_replacement_governance_status_idx
ON executive_control_replacement_governance(tenant_id,status,implementation_due_at,opened_at);
CREATE INDEX IF NOT EXISTS executive_control_replacement_governance_intervention_idx
ON executive_control_replacement_governance(tenant_id,intervention_id,opened_at);
