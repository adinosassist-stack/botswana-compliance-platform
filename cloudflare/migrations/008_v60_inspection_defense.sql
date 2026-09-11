
CREATE TABLE IF NOT EXISTS inspection_scenario_library(
  scenario_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  authority_label TEXT NOT NULL,
  description TEXT NOT NULL,
  control_categories_json TEXT NOT NULL DEFAULT '[]',
  rule_prefixes_json TEXT NOT NULL DEFAULT '[]',
  risk_categories_json TEXT NOT NULL DEFAULT '[]',
  includes_hr_cases INTEGER NOT NULL DEFAULT 0,
  disclaimer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK(status IN ('draft','published','retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inspection_simulation_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  readiness_score INTEGER NOT NULL DEFAULT 0,
  readiness_band TEXT NOT NULL,
  coverage_status TEXT NOT NULL
    CHECK(coverage_status IN ('sufficient','limited','insufficient')),
  critical_findings INTEGER NOT NULL DEFAULT 0,
  high_findings INTEGER NOT NULL DEFAULT 0,
  medium_findings INTEGER NOT NULL DEFAULT 0,
  low_findings INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','partial','failed')),
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_key) REFERENCES inspection_scenario_library(scenario_key)
);
CREATE INDEX IF NOT EXISTS inspection_simulation_runs_tenant_idx
ON inspection_simulation_runs(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS inspection_simulation_findings(
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  finding_type TEXT NOT NULL
    CHECK(finding_type IN ('control','obligation','evidence','risk_event','hr_case','coverage')),
  source_id TEXT,
  severity TEXT NOT NULL
    CHECK(severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','resolved','dismissed')),
  remediation_case_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(run_id) REFERENCES inspection_simulation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS inspection_simulation_findings_run_idx
ON inspection_simulation_findings(run_id,severity,status);

CREATE TABLE IF NOT EXISTS hr_case_evidence_links(
  case_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'supporting'
    CHECK(relationship IN ('primary','supporting','contract','notice','minutes','attendance','leave','other')),
  linked_by_user_id TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(case_id,evidence_id),
  FOREIGN KEY(case_id) REFERENCES hr_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS hr_case_evidence_tenant_idx
ON hr_case_evidence_links(tenant_id,case_id,linked_at DESC);

CREATE TABLE IF NOT EXISTS dispute_defense_packs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  case_type TEXT NOT NULL
    CHECK(case_type IN ('employment')),
  hr_case_id TEXT NOT NULL,
  employee_id TEXT,
  label TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK(status IN ('review_required','assembled','archived')),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  gap_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(hr_case_id) REFERENCES hr_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS dispute_defense_packs_tenant_idx
ON dispute_defense_packs(tenant_id,created_at DESC);

INSERT OR IGNORE INTO inspection_scenario_library(
 scenario_key,name,authority_label,description,control_categories_json,rule_prefixes_json,risk_categories_json,includes_hr_cases,disclaimer
) VALUES
 ('burs-tax-records','BURS Tax Records Readiness','BURS','Tests whether the workspace has current tax obligations, evidence and control records likely to matter in a tax-record review.',
  '["regulatory","evidence","corporate"]','["bw.burs."]','["regulatory","evidence","corporate"]',0,
  'Readiness simulation only. It is not a BURS audit checklist, tax opinion, or prediction of an assessment or penalty.'),
 ('cipa-corporate','CIPA Corporate Records Readiness','CIPA','Tests corporate-governance controls, CIPA obligations and supporting evidence.',
  '["corporate","regulatory","evidence"]','["bw.cipa."]','["corporate","regulatory","evidence"]',0,
  'Readiness simulation only. It does not certify CIPA compliance or replace current CIPA records.'),
 ('employment-labour','Employment & Labour Review','Labour / employment review','Tests employment controls, open HR cases, evidence and employment-rule obligations.',
  '["employment","evidence"]','["bw.employment."]','["employment","evidence"]',1,
  'Operational readiness simulation only. It does not determine fairness, legality, liability or the outcome of a labour dispute.'),
 ('data-protection','Data Protection Readiness','Information & Data Protection','Tests privacy, incident and evidence controls against published data-protection rules in the workspace.',
  '["privacy","incident","evidence","regulatory"]','["bw.data-protection."]','["evidence","regulatory"]',0,
  'Operational readiness simulation only. It does not certify statutory compliance or predict regulator action.'),
 ('ppra-tender','PPRA / Tender Readiness','PPRA / procurement','Tests tender controls, registration obligations and evidence readiness.',
  '["tender","evidence","regulatory"]','["bw.ppra."]','["tender","evidence","regulatory"]',0,
  'Tender-readiness simulation only. It does not guarantee eligibility, responsiveness, award or acceptance by a procuring entity.'),
 ('client-due-diligence','Client / Counterparty Due Diligence','Client / counterparty','Tests broad control and evidence readiness for due-diligence requests from customers, banks, insurers or counterparties.',
  '["employment","regulatory","evidence","licence","tender","corporate","privacy","incident"]','[]',
  '["employment","regulatory","evidence","licence","tender","corporate"]',1,
  'Readiness simulation only. Counterparties may request different information and make their own independent decisions.');

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','inspection_simulator',0,NULL),
 ('business','inspection_simulator',1,NULL),
 ('pro','inspection_simulator',1,NULL),
 ('partner','inspection_simulator',1,NULL),
 ('starter','dispute_defense_pack',0,NULL),
 ('business','dispute_defense_pack',1,NULL),
 ('pro','dispute_defense_pack',1,NULL),
 ('partner','dispute_defense_pack',1,NULL);
