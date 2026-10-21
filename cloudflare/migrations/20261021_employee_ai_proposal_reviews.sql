-- Staged schema only. Apply through reviewed D1 migration process.
-- Approval decisions are recorded separately from workflow definitions.
CREATE TABLE IF NOT EXISTS employee_ai_proposal_reviews (
 tenant_id TEXT NOT NULL,
 proposal_key TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 task_type TEXT NOT NULL,
 due_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
 reviewed_by TEXT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,proposal_key),
 CHECK(length(proposal_key) BETWEEN 1 AND 2048),
 CHECK((status='proposed' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_employee_ai_proposal_reviews_tenant_status
 ON employee_ai_proposal_reviews(tenant_id,status,created_at DESC);
