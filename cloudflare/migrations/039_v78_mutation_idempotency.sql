-- V78 v1.21.54 — replay-safe idempotency ledger for selected high-impact API mutations.
CREATE TABLE IF NOT EXISTS api_idempotency(
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','completed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 100),
  response_status INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  PRIMARY KEY(tenant_id,user_id,scope,idempotency_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS api_idempotency_created_idx
ON api_idempotency(created_at);
