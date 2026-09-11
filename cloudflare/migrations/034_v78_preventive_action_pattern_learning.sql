-- v78 1.21.44 — preventive-action pattern learning.
-- Repeated weak preventive controls are tracked at intervention/control level, never as employee or manager scores.
CREATE TABLE IF NOT EXISTS executive_control_preventive_patterns(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  intervention_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'replacement_required' CHECK(status IN ('replacement_required','resolved')),
  lookback_days INTEGER NOT NULL DEFAULT 180 CHECK(lookback_days BETWEEN 30 AND 365),
  preventive_action_count INTEGER NOT NULL DEFAULT 0,
  failed_effectiveness_count INTEGER NOT NULL DEFAULT 0,
  superseded_action_count INTEGER NOT NULL DEFAULT 0,
  repeated_trigger_kind TEXT,
  repeated_trigger_count INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'high' CHECK(severity IN ('high','critical')),
  reason TEXT NOT NULL,
  stats_json TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by_user_id TEXT,
  resolution_note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(intervention_id) REFERENCES executive_exception_interventions(id) ON DELETE CASCADE,
  FOREIGN KEY(resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,intervention_id)
);
CREATE INDEX IF NOT EXISTS executive_control_preventive_pattern_status_idx
ON executive_control_preventive_patterns(tenant_id,status,severity,last_seen_at);
CREATE INDEX IF NOT EXISTS executive_control_preventive_pattern_intervention_idx
ON executive_control_preventive_patterns(tenant_id,intervention_id,status);
