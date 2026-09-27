-- V175 / Property evidence, controlled archive and profitability history.
-- Extends the governed property register without granting Thebe valuation authority.
PRAGMA foreign_keys=ON;

ALTER TABLE property_assets ADD COLUMN archived_at TEXT;
ALTER TABLE property_assets ADD COLUMN archived_by_user_id TEXT;
ALTER TABLE property_assets ADD COLUMN archive_reason TEXT;

ALTER TABLE property_professional_valuations ADD COLUMN review_due_date TEXT;
ALTER TABLE property_professional_valuations ADD COLUMN review_due_source TEXT NOT NULL DEFAULT 'thebe_policy_365d'
  CHECK(review_due_source IN ('professional_report','thebe_policy_365d'));

CREATE TABLE IF NOT EXISTS property_valuation_evidence_links(
  tenant_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  valuation_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  link_kind TEXT NOT NULL DEFAULT 'signed_report' CHECK(link_kind='signed_report'),
  linked_by_user_id TEXT,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,valuation_id,evidence_id),
  UNIQUE(tenant_id,valuation_id,link_kind),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(property_id) REFERENCES property_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY(valuation_id) REFERENCES property_professional_valuations(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE RESTRICT,
  FOREIGN KEY(linked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS property_valuation_evidence_property_idx
  ON property_valuation_evidence_links(tenant_id,property_id,linked_at DESC);

CREATE TRIGGER IF NOT EXISTS property_valuation_evidence_tenant_guard
BEFORE INSERT ON property_valuation_evidence_links
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1
    FROM property_professional_valuations v
    JOIN property_assets a ON a.id=v.property_id AND a.tenant_id=v.tenant_id
    WHERE v.id=NEW.valuation_id
      AND v.tenant_id=NEW.tenant_id
      AND v.property_id=NEW.property_id
  ) THEN RAISE(ABORT,'property_valuation_evidence_valuation_mismatch') END);
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1
    FROM evidence e
    WHERE e.id=NEW.evidence_id
      AND e.tenant_id=NEW.tenant_id
      AND e.deleted_at IS NULL
      AND e.review_status='approved'
      AND e.scan_status='clean'
      AND e.scanned_at IS NOT NULL
      AND e.malware_name IS NULL
  ) THEN RAISE(ABORT,'property_valuation_evidence_not_ready') END);
END;

CREATE TRIGGER IF NOT EXISTS property_valuation_evidence_immutable_update
BEFORE UPDATE ON property_valuation_evidence_links
BEGIN
  SELECT RAISE(ABORT,'property_valuation_evidence_immutable');
END;

CREATE TRIGGER IF NOT EXISTS property_valuation_evidence_immutable_delete
BEFORE DELETE ON property_valuation_evidence_links
WHEN EXISTS(SELECT 1 FROM tenants t WHERE t.id=OLD.tenant_id)
BEGIN
  SELECT RAISE(ABORT,'property_valuation_evidence_immutable');
END;

CREATE TRIGGER IF NOT EXISTS property_professional_valuation_review_due_guard
BEFORE INSERT ON property_professional_valuations
WHEN NEW.review_due_date IS NOT NULL
BEGIN
  SELECT (CASE WHEN length(NEW.review_due_date)<>10
    OR date(NEW.review_due_date) IS NULL
    OR NEW.review_due_date<NEW.valuation_date
  THEN RAISE(ABORT,'property_valuation_review_due_invalid') END);
END;

CREATE TABLE IF NOT EXISTS property_operating_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(length(currency)=3),
  annual_rent_minor INTEGER NOT NULL CHECK(annual_rent_minor>=0),
  annual_operating_cost_minor INTEGER NOT NULL CHECK(annual_operating_cost_minor>=0),
  debt_balance_minor INTEGER NOT NULL CHECK(debt_balance_minor>=0),
  source_kind TEXT NOT NULL DEFAULT 'property_register_update'
    CHECK(source_kind IN ('migration_baseline','property_register_create','property_register_update')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(length(snapshot_date)=10),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(property_id) REFERENCES property_assets(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS property_operating_snapshots_property_idx
  ON property_operating_snapshots(tenant_id,property_id,snapshot_date DESC,created_at DESC);

CREATE TRIGGER IF NOT EXISTS property_operating_snapshot_tenant_guard
BEFORE INSERT ON property_operating_snapshots
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM property_assets a
    WHERE a.id=NEW.property_id AND a.tenant_id=NEW.tenant_id AND a.currency=NEW.currency
  ) THEN RAISE(ABORT,'property_operating_snapshot_asset_mismatch') END);
END;

CREATE TRIGGER IF NOT EXISTS property_operating_snapshots_immutable_update
BEFORE UPDATE ON property_operating_snapshots
BEGIN
  SELECT RAISE(ABORT,'property_operating_snapshot_immutable');
END;

CREATE TRIGGER IF NOT EXISTS property_operating_snapshots_immutable_delete
BEFORE DELETE ON property_operating_snapshots
WHEN EXISTS(SELECT 1 FROM tenants t WHERE t.id=OLD.tenant_id)
BEGIN
  SELECT RAISE(ABORT,'property_operating_snapshot_immutable');
END;

INSERT INTO property_operating_snapshots(
  id,tenant_id,property_id,snapshot_date,currency,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,source_kind,created_by_user_id
)
SELECT
  lower(hex(randomblob(16))),tenant_id,id,date('now'),currency,annual_rent_minor,annual_operating_cost_minor,debt_balance_minor,'migration_baseline',created_by_user_id
FROM property_assets
WHERE NOT EXISTS(
  SELECT 1 FROM property_operating_snapshots s
  WHERE s.tenant_id=property_assets.tenant_id AND s.property_id=property_assets.id
);

UPDATE property_assets
SET archived_at=COALESCE(archived_at,updated_at),
    archive_reason=COALESCE(NULLIF(trim(archive_reason),''),'Historical archived property')
WHERE status='archived';
