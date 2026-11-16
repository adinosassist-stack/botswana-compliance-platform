-- PRIVATE STAGING ONLY. No production migration authorized.
-- A tenant/request pair is idempotent; no customer prompts or response bodies stored.
CREATE TABLE IF NOT EXISTS ai_usage_journal (
  tenant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  usage_known INTEGER NOT NULL CHECK(usage_known IN (0,1)),
  input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens >= 0),
  cached_input_tokens INTEGER CHECK(cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,request_id),
  CHECK ((usage_known=0 AND input_tokens IS NULL AND output_tokens IS NULL)
    OR (usage_known=1 AND input_tokens IS NOT NULL AND output_tokens IS NOT NULL)),
  CHECK (cached_input_tokens IS NULL OR cached_input_tokens <= input_tokens)
);
CREATE INDEX IF NOT EXISTS ai_usage_journal_tenant_date ON ai_usage_journal(tenant_id,created_at);
