-- CANDIDATE ONLY. NOT registered with any production/staging migration runner.
-- Requires independent schema review, database-specific qualification and explicit approval.
CREATE TABLE IF NOT EXISTS ai_document_export_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'docx', 'pptx')),
  document_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'completed')),
  object_key TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (expires_at > created_at),
  CHECK (status = 'queued' OR object_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ai_export_tenant_actor
  ON ai_document_export_jobs(tenant_id, actor_id, id);
CREATE INDEX IF NOT EXISTS idx_ai_export_expiry
  ON ai_document_export_jobs(expires_at);
