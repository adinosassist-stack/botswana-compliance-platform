CREATE TABLE IF NOT EXISTS management_review_assignments(
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,source_type,source_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(assigned_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS management_review_assignments_reviewer_idx
ON management_review_assignments(tenant_id,reviewer_user_id,assigned_at);

CREATE TABLE IF NOT EXISTS management_review_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('assigned','claimed','approved','returned')),
  actor_user_id TEXT NOT NULL,
  reviewer_user_id TEXT,
  note TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS management_review_events_source_idx
ON management_review_events(tenant_id,source_type,source_id,occurred_at DESC);
