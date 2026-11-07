-- CANDIDATE ONLY. Requires a new, separately approved staging-only D1 database.
-- DO NOT apply to production or the existing General AI authentication D1.
-- Claims are permanent during the qualification window; never release after errors.
CREATE TABLE ai_private_queue_nonce_claims (
 claim_hash TEXT PRIMARY KEY NOT NULL CHECK(length(claim_hash)=64),
 source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
 claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
