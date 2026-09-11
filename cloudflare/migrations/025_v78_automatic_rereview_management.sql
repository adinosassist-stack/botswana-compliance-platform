CREATE TABLE IF NOT EXISTS management_rereview_queue(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','claimed','resolved','superseded')),
  reason TEXT NOT NULL,
  changed_json TEXT NOT NULL DEFAULT '[]',
  reviewer_user_id TEXT,
  response_due_at TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  resolved_at TEXT,
  resolved_by_decision_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(decision_id) REFERENCES management_review_decisions(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(resolved_by_decision_id) REFERENCES management_review_decisions(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,decision_id)
);
CREATE INDEX IF NOT EXISTS management_rereview_queue_status_idx ON management_rereview_queue(tenant_id,status,response_due_at);
CREATE INDEX IF NOT EXISTS management_rereview_queue_reviewer_idx ON management_rereview_queue(tenant_id,reviewer_user_id,status,response_due_at);
