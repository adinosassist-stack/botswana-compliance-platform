-- v77: evidence-backed CIPA/OBRS registry snapshots and explicit profile reconciliation.

CREATE TABLE IF NOT EXISTS cipa_registry_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obrs_company_extract','cipa_register_search')),
  source_observed_at TEXT NOT NULL,
  evidence_id TEXT,
  registration_number TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  state_version_at_import INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TEXT,
  UNIQUE(tenant_id,company_id,content_hash),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS cipa_registry_snapshots_company_idx
ON cipa_registry_snapshots(tenant_id,company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS cipa_reconciliation_items(
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  field_key TEXT NOT NULL CHECK(field_key IN ('registration_number','legal_name','entity_type','registration_status','registration_date','annual_return_month','registered_office')),
  internal_value TEXT NOT NULL DEFAULT '',
  registry_value TEXT NOT NULL DEFAULT '',
  internal_value_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('matched','pending','applied_registry','kept_internal','superseded')),
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_id,field_key),
  FOREIGN KEY(snapshot_id) REFERENCES cipa_registry_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS cipa_reconciliation_items_pending_idx
ON cipa_reconciliation_items(tenant_id,company_id,status,created_at DESC);
