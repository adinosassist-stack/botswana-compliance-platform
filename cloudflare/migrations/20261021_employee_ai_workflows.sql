-- Cloudflare D1 version of employee workflow schema.
-- Apply only via reviewed Cloudflare D1 migration process, not Postgres migrate.
CREATE TABLE IF NOT EXISTS employee_ai_workflows (
 tenant_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 definition TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(tenant_id,owner_id,workflow_id),
 CHECK(length(workflow_id) BETWEEN 1 AND 64),
 CHECK(json_valid(definition)),
 CHECK(length(definition) <= 16384)
);
CREATE INDEX IF NOT EXISTS idx_employee_ai_workflows_owner
 ON employee_ai_workflows(tenant_id,owner_id,updated_at DESC);
