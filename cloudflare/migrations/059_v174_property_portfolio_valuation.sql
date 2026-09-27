-- V174 / Property Portfolio & Professional Valuation foundation.
-- Thebe stores a canonical tenant property register and records externally signed professional
-- valuation reports. Thebe does not generate, certify or sign a market valuation.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS property_assets(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  asset_code TEXT,
  name TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'other'
    CHECK(property_type IN ('residential','commercial','industrial','land','mixed_use','other')),
  location_text TEXT NOT NULL DEFAULT '',
  tenure_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK(tenure_type IN ('freehold','leasehold','customary','state','other','unknown')),
  currency TEXT NOT NULL DEFAULT 'BWP' CHECK(length(currency)=3),
  acquisition_date TEXT,
  acquisition_cost_minor INTEGER CHECK(acquisition_cost_minor IS NULL OR acquisition_cost_minor>=0),
  annual_rent_minor INTEGER NOT NULL DEFAULT 0 CHECK(annual_rent_minor>=0),
  annual_operating_cost_minor INTEGER NOT NULL DEFAULT 0 CHECK(annual_operating_cost_minor>=0),
  debt_balance_minor INTEGER NOT NULL DEFAULT 0 CHECK(debt_balance_minor>=0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,asset_code),
  CHECK(acquisition_date IS NULL OR length(acquisition_date)=10),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS property_assets_tenant_idx
  ON property_assets(tenant_id,status,name);

CREATE TABLE IF NOT EXISTS property_professional_valuations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  valuation_date TEXT NOT NULL,
  market_value_minor INTEGER NOT NULL CHECK(market_value_minor>0),
  currency TEXT NOT NULL CHECK(length(currency)=3),
  valuer_name TEXT NOT NULL,
  valuer_registration_ref TEXT NOT NULL,
  report_reference TEXT NOT NULL,
  methodology_note TEXT NOT NULL DEFAULT '',
  source_kind TEXT NOT NULL DEFAULT 'external_professional_report'
    CHECK(source_kind='external_professional_report'),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,property_id,report_reference),
  CHECK(length(valuation_date)=10),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(property_id) REFERENCES property_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS property_professional_valuations_property_idx
  ON property_professional_valuations(tenant_id,property_id,valuation_date DESC,created_at DESC);

CREATE TRIGGER IF NOT EXISTS property_professional_valuation_tenant_guard
BEFORE INSERT ON property_professional_valuations
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM property_assets a
    WHERE a.id=NEW.property_id AND a.tenant_id=NEW.tenant_id AND a.status='active'
  ) THEN RAISE(ABORT,'property_asset_tenant_mismatch') END);
END;

CREATE TRIGGER IF NOT EXISTS property_professional_valuation_currency_guard
BEFORE INSERT ON property_professional_valuations
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM property_assets a
    WHERE a.id=NEW.property_id AND a.tenant_id=NEW.tenant_id AND a.currency=NEW.currency
  ) THEN RAISE(ABORT,'property_valuation_currency_mismatch') END);
END;

CREATE TRIGGER IF NOT EXISTS property_professional_valuations_immutable_update
BEFORE UPDATE ON property_professional_valuations
BEGIN
  SELECT RAISE(ABORT,'property_professional_valuation_immutable');
END;

CREATE TRIGGER IF NOT EXISTS property_professional_valuations_immutable_delete
BEFORE DELETE ON property_professional_valuations
WHEN EXISTS(SELECT 1 FROM tenants t WHERE t.id=OLD.tenant_id)
BEGIN
  SELECT RAISE(ABORT,'property_professional_valuation_immutable');
END;
