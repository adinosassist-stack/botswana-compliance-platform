-- REVIEW ONLY: quotation draft D1 staging migration candidate.
-- NOT approved for execution. Requires independent thusico approval + owner
-- exact SQL authorization for bw-quotation-staging only.
-- This is additive to separately reviewed quotation logo schema; it is not
-- part of the previous logo schema and must be separately qualified.
-- No IF NOT EXISTS: unexpected pre-existing table fails closed.
CREATE TABLE quotation_drafts (
 tenant_id TEXT NOT NULL CHECK(
   length(tenant_id) BETWEEN 1 AND 100
   AND tenant_id NOT GLOB '*[^A-Za-z0-9_-]*'
 ),
 id TEXT NOT NULL CHECK(
   length(id) BETWEEN 1 AND 100 AND id NOT GLOB '*[^A-Za-z0-9_-]*'
 ),
 revision INTEGER NOT NULL CHECK(
   typeof(revision)='integer' AND revision BETWEEN 1 AND 2147483647
 ),
 draft_json TEXT NOT NULL CHECK(
   length(draft_json) BETWEEN 2 AND 32768
   AND json_valid(draft_json)
 ),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,id)
);
CREATE INDEX idx_quotation_drafts_tenant_updated
 ON quotation_drafts (tenant_id,updated_at);
