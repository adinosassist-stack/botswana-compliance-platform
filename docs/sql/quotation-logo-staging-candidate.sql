-- QUOTATION LOGO: optional staging-only schema candidate. DO NOT RUN ON PRODUCTION.
-- Authoritative migration order/backup review required before promotion.
CREATE TABLE IF NOT EXISTS quotation_logo_assets (
 id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 object_key TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg')),
 width INTEGER NOT NULL CHECK(width BETWEEN 30 AND 5000),
 height INTEGER NOT NULL CHECK(height BETWEEN 20 AND 5000),
 aspect_ratio REAL NOT NULL CHECK(aspect_ratio > 0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,id),
 UNIQUE(object_key)
);
CREATE TABLE IF NOT EXISTS quotation_logo_settings (
 tenant_id TEXT NOT NULL PRIMARY KEY,
 asset_id TEXT NOT NULL,
 x_percent REAL NOT NULL CHECK(x_percent BETWEEN 0 AND 100),
 y_percent REAL NOT NULL CHECK(y_percent BETWEEN 0 AND 100),
 width_percent REAL NOT NULL CHECK(width_percent > 0 AND width_percent <= 60),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (tenant_id,asset_id) REFERENCES quotation_logo_assets(tenant_id,id)
);
