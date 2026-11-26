-- REVIEW DRAFT ONLY. Not in production migrations or automatic staging apply.
-- Apply only after exact isolated database, recovery and protected review approval.
CREATE TABLE IF NOT EXISTS daily_report_manager_reviews(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 report_id TEXT NOT NULL REFERENCES daily_employee_reports(id) ON DELETE CASCADE,
 revision_no INTEGER NOT NULL CHECK(revision_no>=0),
 manager_user_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL CHECK(action IN ('acknowledge','approve','return')),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,report_id,revision_no,action)
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_report_manager_reviews_final_uq
 ON daily_report_manager_reviews(tenant_id,report_id,revision_no)
 WHERE action IN ('approve','return');
CREATE INDEX IF NOT EXISTS daily_report_manager_reviews_tenant_report_idx
 ON daily_report_manager_reviews(tenant_id,report_id,revision_no);
