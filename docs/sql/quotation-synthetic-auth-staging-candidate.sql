-- REVIEW ONLY: disposable synthetic quotation-auth D1 schema candidate.
-- Proposed target NAME: bw-quotation-auth-synthetic-staging (not provisioned).
-- NO authorization to run SQL or create a Cloudflare database.
-- Never execute against bw-quotation-staging, production, General AI staging,
-- any shared authentication database, or any environment with customer data.
-- Must have an approved, newly created exact D1 UUID, zero app tables,
-- separately accepted recovery/teardown plan and owner + thusico approvals.
-- No IF NOT EXISTS so replay and unexpected existing schema fail closed.
-- Do not insert real users, sessions, membership data, HMAC keys or tokens.

CREATE TABLE users (
 id TEXT NOT NULL PRIMARY KEY CHECK(
  length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'
 ),
 session_generation INTEGER NOT NULL DEFAULT 1 CHECK(
  typeof(session_generation)='integer' AND session_generation BETWEEN 1 AND 2147483647
 )
);
CREATE TABLE memberships (
 tenant_id TEXT NOT NULL CHECK(
  length(tenant_id)=36 AND tenant_id NOT GLOB '*[^A-Za-z0-9_-]*'
 ),
 user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','manager','staff')),
 status TEXT NOT NULL CHECK(status IN ('active','disabled')),
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE sessions (
 token_hash TEXT NOT NULL PRIMARY KEY CHECK(
  length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'
 ),
 user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 csrf_token TEXT NOT NULL CHECK(length(csrf_token) BETWEEN 16 AND 256),
 session_generation INTEGER NOT NULL CHECK(
  typeof(session_generation)='integer' AND session_generation BETWEEN 1 AND 2147483647
 ),
 expires_at TEXT NOT NULL CHECK(
  length(expires_at)=19 AND expires_at GLOB '????-??-?? ??:??:??'
 ),
 FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
);
