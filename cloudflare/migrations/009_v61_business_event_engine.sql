
CREATE TABLE IF NOT EXISTS business_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL
    CHECK(event_category IN ('workforce','tax','corporate','operations','premises','licence','tender','data')),
  source_type TEXT NOT NULL,
  source_id TEXT,
  event_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','processing','completed','partial','failed')),
  event_data_json TEXT NOT NULL DEFAULT '{}',
  effects_summary_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,event_key)
);
CREATE INDEX IF NOT EXISTS business_events_tenant_idx
ON business_events(tenant_id,status,occurred_at DESC);

CREATE TABLE IF NOT EXISTS business_event_effects(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  effect_type TEXT NOT NULL
    CHECK(effect_type IN ('regulatory_recheck','statutory_recalc','industry_refresh','assurance_refresh','risk_refresh','inspection_invalidate','passport_invalidate')),
  sequence_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','completed','partial','failed','skipped')),
  cursor_text TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(event_id) REFERENCES business_events(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(event_id,effect_type)
);
CREATE INDEX IF NOT EXISTS business_event_effects_queue_idx
ON business_event_effects(status,sequence_no,event_id);

CREATE TABLE IF NOT EXISTS business_event_failures(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  effect_id TEXT,
  tenant_id TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(event_id) REFERENCES business_events(id) ON DELETE CASCADE,
  FOREIGN KEY(effect_id) REFERENCES business_event_effects(id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS business_event_failures_idx
ON business_event_failures(tenant_id,resolved_at,created_at DESC);

CREATE TABLE IF NOT EXISTS business_event_engine_state(
  state_key TEXT PRIMARY KEY,
  state_value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','business_event_engine',1,NULL),
 ('business','business_event_engine',1,NULL),
 ('pro','business_event_engine',1,NULL),
 ('partner','business_event_engine',1,NULL);


CREATE TABLE IF NOT EXISTS business_event_impacts(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  impact_type TEXT NOT NULL
    CHECK(impact_type IN ('regulatory_rule','statutory_schedule','control','risk_event','inspection_pack','passport_verification')),
  source_id TEXT NOT NULL,
  impact_level TEXT NOT NULL
    CHECK(impact_level IN ('info','review','action','urgent')),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES business_events(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(event_id,impact_type,source_id)
);
CREATE INDEX IF NOT EXISTS business_event_impacts_event_idx
ON business_event_impacts(event_id,impact_level,impact_type);
