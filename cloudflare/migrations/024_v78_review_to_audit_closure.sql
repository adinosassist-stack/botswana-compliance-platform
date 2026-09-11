CREATE TABLE IF NOT EXISTS management_review_decisions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approve','return')),
  validity_status TEXT NOT NULL DEFAULT 'pending' CHECK(validity_status IN ('pending','valid','stale','returned')),
  reviewer_user_id TEXT,
  reviewer_name TEXT NOT NULL,
  decision_note TEXT NOT NULL,
  attestation_text TEXT NOT NULL,
  attested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  source_hash TEXT NOT NULL,
  evidence_snapshot_json TEXT NOT NULL DEFAULT '[]',
  evidence_hash TEXT NOT NULL,
  sealed_at TEXT,
  invalidated_at TEXT,
  invalidation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS management_review_decisions_tenant_idx
ON management_review_decisions(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS management_review_decisions_source_idx
ON management_review_decisions(tenant_id,source_type,source_id,created_at DESC);
CREATE INDEX IF NOT EXISTS management_review_decisions_validity_idx
ON management_review_decisions(tenant_id,validity_status,created_at DESC);
