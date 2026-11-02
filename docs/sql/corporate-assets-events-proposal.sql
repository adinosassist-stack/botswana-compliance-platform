-- REVIEW-ONLY PostgreSQL proposal. Do not run on Cloudflare D1 or production.
-- Requires corporate_assets and application roles from separately reviewed migrations.
CREATE TABLE IF NOT EXISTS corporate_asset_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id UUID NOT NULL,
 asset_id UUID NOT NULL,
 actor_id UUID NOT NULL,
 event_type VARCHAR(40) NOT NULL CHECK(event_type IN ('branch_transfer','status_change')),
 details JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,asset_id) REFERENCES corporate_assets(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS corporate_asset_events_lookup_idx ON corporate_asset_events(company_id,asset_id,created_at DESC);
REVOKE ALL ON corporate_asset_events FROM PUBLIC;
ALTER TABLE corporate_asset_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_asset_events FORCE ROW LEVEL SECURITY;
-- Deliberately no permissive RLS policies. Append-only permissions and DB-enforced
-- immutability require qualification before this proposal can be activated.
