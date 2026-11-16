-- QUOTATION LOGO: isolated D1 staging-only candidate for issue #2504.
-- REVIEW ONLY. Never run on production or any unrelated staging database.
-- Apply ONLY after separate owner + independent thusico migration approval.
-- Preflight MUST confirm the exact D1 UUID and zero pre-existing app tables.
-- No IF NOT EXISTS: existing or unexpected tables must abort qualification
-- rather than silently accepting an incompatible schema.
-- This candidate fixes the private R2 prefix to quotation-logos/.
CREATE TABLE quotation_logo_assets (
 id TEXT NOT NULL CHECK(length(id) BETWEEN 1 AND 100 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 1 AND 100 AND tenant_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 object_key TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg')),
 width INTEGER NOT NULL CHECK(typeof(width)='integer' AND width BETWEEN 30 AND 5000),
 height INTEGER NOT NULL CHECK(typeof(height)='integer' AND height BETWEEN 20 AND 5000),
 aspect_ratio REAL NOT NULL CHECK(
  aspect_ratio > 0 AND abs(aspect_ratio - CAST(width AS REAL)/height) <= 0.0001
 ),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,id),
 UNIQUE(object_key),
 CHECK(object_key = 'quotation-logos/' || tenant_id || '/' || id)
);
CREATE TABLE quotation_logo_settings (
 tenant_id TEXT NOT NULL PRIMARY KEY,
 asset_id TEXT NOT NULL,
 x_percent REAL NOT NULL CHECK(x_percent BETWEEN 0 AND 100),
 y_percent REAL NOT NULL CHECK(y_percent BETWEEN 0 AND 100),
 width_percent REAL NOT NULL CHECK(width_percent > 0 AND width_percent <= 60),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(x_percent + width_percent <= 100.00001),
 FOREIGN KEY (tenant_id,asset_id) REFERENCES quotation_logo_assets(tenant_id,id)
);
