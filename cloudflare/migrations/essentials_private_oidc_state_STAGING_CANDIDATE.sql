-- SOURCE ONLY: UNEXECUTED, ISOLATED Essentials private-staging D1 candidate.
-- No Cloudflare operation, Worker binding, customer data or live routes.
-- Requires separate exact-SQL/resource owner and independent thusico approvals.
-- The host must keep the nonextractable AES-GCM key outside D1 and logs.
CREATE TABLE essentials_private_oidc_authorization_attempts (
 state_sha256 TEXT PRIMARY KEY NOT NULL
   CHECK(length(state_sha256)=64 AND state_sha256 NOT GLOB '*[^0-9a-f]*'),
 session_key_sha256 TEXT NOT NULL
   CHECK(length(session_key_sha256)=64 AND session_key_sha256 NOT GLOB '*[^0-9a-f]*'),
 tenant_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 challenge_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 nonce_sha256 TEXT NOT NULL
   CHECK(length(nonce_sha256)=64 AND nonce_sha256 NOT GLOB '*[^0-9a-f]*'),
 verifier_iv BLOB NOT NULL CHECK(length(verifier_iv)=12),
 verifier_ciphertext BLOB NOT NULL CHECK(length(verifier_ciphertext) BETWEEN 17 AND 512),
 issuer TEXT NOT NULL CHECK(substr(issuer,1,8)='https://'),
 client_id TEXT NOT NULL,
 redirect_uri TEXT NOT NULL CHECK(substr(redirect_uri,1,8)='https://'),
 token_endpoint TEXT NOT NULL CHECK(substr(token_endpoint,1,8)='https://'),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
   expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','consumed','revoked')),
 consumed_at_ms INTEGER,
 CHECK((state='consumed' AND consumed_at_ms IS NOT NULL) OR
       (state IN ('pending','revoked') AND consumed_at_ms IS NULL))
);
CREATE UNIQUE INDEX essentials_private_one_pending_oidc_per_session_quote
 ON essentials_private_oidc_authorization_attempts(
  session_key_sha256,tenant_id,quotation_id)
 WHERE state='pending';
CREATE INDEX essentials_private_oidc_attempt_expiry
 ON essentials_private_oidc_authorization_attempts(state,expires_at_ms);
CREATE TRIGGER essentials_private_oidc_state_no_delete BEFORE DELETE
 ON essentials_private_oidc_authorization_attempts
 BEGIN SELECT RAISE(ABORT,'oidc_state_delete_denied'); END;
CREATE TRIGGER essentials_private_oidc_state_guard BEFORE UPDATE
 ON essentials_private_oidc_authorization_attempts
 WHEN OLD.state<>'pending'
   OR NEW.state NOT IN ('consumed','revoked')
   OR NEW.state_sha256<>OLD.state_sha256
   OR NEW.session_key_sha256<>OLD.session_key_sha256
   OR NEW.tenant_id<>OLD.tenant_id
   OR NEW.actor_user_id<>OLD.actor_user_id
   OR NEW.quotation_id<>OLD.quotation_id
   OR NEW.challenge_id<>OLD.challenge_id
   OR NEW.customer_id<>OLD.customer_id
   OR NEW.nonce_sha256<>OLD.nonce_sha256
   OR NEW.verifier_iv<>OLD.verifier_iv
   OR NEW.verifier_ciphertext<>OLD.verifier_ciphertext
   OR NEW.issuer<>OLD.issuer OR NEW.client_id<>OLD.client_id
   OR NEW.redirect_uri<>OLD.redirect_uri OR NEW.token_endpoint<>OLD.token_endpoint
   OR NEW.issued_at_ms<>OLD.issued_at_ms
   OR NEW.expires_at_ms<>OLD.expires_at_ms
   OR (NEW.state='consumed' AND NEW.consumed_at_ms IS NULL)
   OR (NEW.state='revoked' AND NEW.consumed_at_ms IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'oidc_state_immutable'); END;
