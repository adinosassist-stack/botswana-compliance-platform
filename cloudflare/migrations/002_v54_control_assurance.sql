CREATE TABLE IF NOT EXISTS control_library(
  control_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK(category IN ('employment','regulatory','evidence','licence','tender','corporate','privacy','incident')),
  objective TEXT NOT NULL,
  evidence_hint TEXT,
  risk_weight INTEGER NOT NULL DEFAULT 10,
  review_frequency_days INTEGER NOT NULL DEFAULT 90,
  source_policy TEXT NOT NULL DEFAULT 'operational'
    CHECK(source_policy IN ('operational','rule_mapped')),
  status TEXT NOT NULL DEFAULT 'published'
    CHECK(status IN ('draft','published','retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS control_rule_mappings(
  control_key TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  mapping_status TEXT NOT NULL DEFAULT 'approved'
    CHECK(mapping_status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(control_key,rule_id),
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_control_status(
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review'
    CHECK(status IN ('passing','attention','failed','review','not_applicable')),
  assurance_level TEXT NOT NULL DEFAULT 'unverified'
    CHECK(assurance_level IN ('unverified','self_attested','evidence_backed','reviewed')),
  owner_user_id TEXT,
  due_at TEXT,
  last_tested_at TEXT,
  next_review_at TEXT,
  source_summary_json TEXT NOT NULL DEFAULT '{}',
  evidence_health TEXT NOT NULL DEFAULT 'unknown'
    CHECK(evidence_health IN ('healthy','attention','expired','missing','unknown')),
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,control_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tenant_control_status_idx
ON tenant_control_status(tenant_id,status,evidence_health,updated_at DESC);

CREATE TABLE IF NOT EXISTS control_evidence_links(
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'supporting'
    CHECK(link_type IN ('primary','supporting','test_sample')),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,control_key,evidence_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS remediation_cases(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL
    CHECK(source_type IN ('risk_event','control','regulatory_change','obligation','evidence')),
  source_id TEXT,
  control_key TEXT,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK(severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','review','resolved','accepted_risk','canceled')),
  owner_user_id TEXT,
  due_at TEXT,
  requires_professional INTEGER NOT NULL DEFAULT 0,
  service_order_id TEXT,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE SET NULL,
  UNIQUE(tenant_id,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS remediation_cases_tenant_idx
ON remediation_cases(tenant_id,status,severity,due_at);

CREATE TABLE IF NOT EXISTS remediation_case_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remediation_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(remediation_id) REFERENCES remediation_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS regulatory_change_cases(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  applicability_status TEXT NOT NULL
    CHECK(applicability_status IN ('applies','review','unknown')),
  impact_level TEXT NOT NULL DEFAULT 'review'
    CHECK(impact_level IN ('review','action','urgent')),
  status TEXT NOT NULL DEFAULT 'assessing'
    CHECK(status IN ('assessing','action_required','implemented','dismissed')),
  explanation TEXT NOT NULL,
  obligation_count INTEGER NOT NULL DEFAULT 0,
  owner_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(rule_id) REFERENCES regulatory_rules(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,rule_id)
);
CREATE INDEX IF NOT EXISTS regulatory_change_cases_tenant_idx
ON regulatory_change_cases(tenant_id,status,impact_level,updated_at DESC);

CREATE TABLE IF NOT EXISTS evidence_health_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  health_score INTEGER NOT NULL,
  approved_count INTEGER NOT NULL DEFAULT 0,
  quarantined_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  expiring_count INTEGER NOT NULL DEFAULT 0,
  expired_count INTEGER NOT NULL DEFAULT 0,
  missing_required_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS evidence_health_snapshots_tenant_idx
ON evidence_health_snapshots(tenant_id,created_at DESC);

ALTER TABLE evidence ADD COLUMN valid_until TEXT;
ALTER TABLE evidence ADD COLUMN superseded_at TEXT;

INSERT OR IGNORE INTO control_library(control_key,name,category,objective,evidence_hint,risk_weight,review_frequency_days,source_policy,status) VALUES
('EMPLOYMENT_RECORDS','Employment records','employment','Maintain current and defensible employment records for active workers.','signed contracts, leave, attendance and review records',18,30,'operational','published'),
('EMPLOYMENT_CASE_PROCESS','Employment case process','employment','Use controlled, documented review for disciplinary, grievance and other high-risk employment cases.','case chronology, notices, minutes and review evidence',18,30,'operational','published'),
('REGULATORY_CHANGE_CONTROL','Regulatory change control','regulatory','Assess published regulatory changes against the company profile and convert applicable changes into controlled actions.','approved source, applicability basis and action record',20,30,'rule_mapped','published'),
('MANDATORY_EVIDENCE','Mandatory evidence assurance','evidence','Ensure evidence required by compliance obligations is approved, current and traceable.','approved evidence linked to obligation or control',18,30,'operational','published'),
('LICENCE_CONTINUITY','Licence continuity','licence','Keep applicable operating licences active and renewal work ahead of recorded due dates.','licence record, renewal proof and authority correspondence',14,30,'operational','published'),
('TENDER_READINESS_CONTROL','Tender readiness control','tender','Keep mandatory tender requirements complete before recorded closing dates.','requirement checklist and approved submission evidence',12,14,'operational','published'),
('CORPORATE_ACTION_CONTROL','Corporate action control','corporate','Keep controlled company/governance actions progressing through required review and completion states.','resolution, filing, approval and completion evidence',10,30,'operational','published'),
('DATA_ACCESS_CONTROL','Data access and privacy control','privacy','Maintain controlled access, handling and retention of company, employee and customer information.','access records, privacy controls and retention decisions',12,90,'operational','published'),
('INCIDENT_EVIDENCE_CONTROL','Incident evidence control','incident','Preserve material incident and corrective-action evidence in a controlled, reviewable trail.','incident report, supporting evidence and corrective action',10,90,'operational','published');

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
('starter','control_assurance',1,NULL),
('business','control_assurance',1,NULL),
('pro','control_assurance',1,NULL),
('partner','control_assurance',1,NULL),
('starter','advanced_remediation',0,NULL),
('business','advanced_remediation',1,NULL),
('pro','advanced_remediation',1,NULL),
('partner','advanced_remediation',1,NULL),
('starter','regulatory_change_control',0,NULL),
('business','regulatory_change_control',1,NULL),
('pro','regulatory_change_control',1,NULL),
('partner','regulatory_change_control',1,NULL),
('starter','evidence_health',1,NULL),
('business','evidence_health',1,NULL),
('pro','evidence_health',1,NULL),
('partner','evidence_health',1,NULL);

ALTER TABLE remediation_cases ADD COLUMN risk_acceptance_reason TEXT;
ALTER TABLE remediation_cases ADD COLUMN risk_acceptance_expires_at TEXT;
ALTER TABLE regulatory_change_cases ADD COLUMN resolution_notes TEXT;
