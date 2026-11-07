-- Namibia compliance persistence candidate. NOT in cloudflare/migrations; DO NOT apply to production.
-- Designed for a disposable D1 rehearsal only, after security review.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS na_compliance_entities (
  tenant_id TEXT NOT NULL,
  entity_ref TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('company','close_corporation','section21_company')),
  financial_year_end TEXT NOT NULL CHECK(length(financial_year_end)=10),
  country_code TEXT NOT NULL DEFAULT 'NA' CHECK(country_code='NA'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, entity_ref)
);

CREATE TABLE IF NOT EXISTS na_compliance_evidence (
  tenant_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  entity_ref TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 160),
  external_reference TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'metadata_only' CHECK(status='metadata_only'),
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified=0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, evidence_id),
  FOREIGN KEY (tenant_id, entity_ref) REFERENCES na_compliance_entities(tenant_id, entity_ref) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS na_compliance_evidence_entity_idx
  ON na_compliance_evidence(tenant_id,entity_ref,created_at DESC);

CREATE TABLE IF NOT EXISTS na_compliance_calendar_drafts (
  tenant_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  entity_ref TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_title TEXT NOT NULL,
  planning_date TEXT NOT NULL CHECK(length(planning_date)=10),
  official_deadline_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(official_deadline_confirmed=0),
  notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(notification_enabled=0),
  filing_enabled INTEGER NOT NULL DEFAULT 0 CHECK(filing_enabled=0),
  source_url TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,draft_id),
  FOREIGN KEY (tenant_id, entity_ref) REFERENCES na_compliance_entities(tenant_id, entity_ref) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS na_compliance_calendar_tenant_date_idx
  ON na_compliance_calendar_drafts(tenant_id,planning_date);

CREATE TABLE IF NOT EXISTS na_compliance_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  entity_ref TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('entity_draft_created','evidence_metadata_created','calendar_draft_created')),
  record_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,event_id),
  FOREIGN KEY (tenant_id,entity_ref) REFERENCES na_compliance_entities(tenant_id,entity_ref) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS na_compliance_audit_tenant_idx ON na_compliance_audit_events(tenant_id,occurred_at DESC);
-- Intentionally no update/delete of audit records in candidate repository code.
