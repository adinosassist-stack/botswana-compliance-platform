-- Reviewable additive schema only. No runner or production execution is authorized.
-- Apply only after independently reviewed staging rehearsal and release authorization.
CREATE TABLE corporate_assets (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
 category TEXT NOT NULL CHECK(category IN ('fleet','it','machinery','furniture','other')),
 branch TEXT NOT NULL CHECK(length(branch) BETWEEN 1 AND 100),
 serial TEXT NOT NULL DEFAULT '' CHECK(length(serial)<=100),
 custodian TEXT NOT NULL DEFAULT '' CHECK(length(custodian)<=160),
 acquisition_date TEXT NOT NULL,
 acquisition_cost_minor INTEGER NOT NULL CHECK(acquisition_cost_minor BETWEEN 0 AND 999999999999),
 book_value_minor INTEGER NOT NULL CHECK(book_value_minor BETWEEN 0 AND 999999999999),
 status TEXT NOT NULL CHECK(status IN ('active','maintenance','written_off','decommissioned')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX corporate_assets_serial ON corporate_assets(tenant_id,lower(serial)) WHERE serial<>'';
CREATE INDEX corporate_assets_tenant ON corporate_assets(tenant_id,id);
CREATE TABLE corporate_asset_services (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('service','repair','insurance','warranty')),
 serviced_on TEXT NOT NULL,
 due_on TEXT NOT NULL CHECK(due_on>=serviced_on),
 cost_minor INTEGER NOT NULL CHECK(cost_minor BETWEEN 0 AND 999999999999),
 provider TEXT NOT NULL DEFAULT '' CHECK(length(provider)<=160),
 description TEXT NOT NULL CHECK(length(description) BETWEEN 2 AND 500),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(tenant_id,asset_id) REFERENCES corporate_assets(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX corporate_asset_services_due ON corporate_asset_services(tenant_id,due_on,id);
