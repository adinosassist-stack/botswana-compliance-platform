-- SOURCE ONLY. UNEXECUTED, ISOLATED Essentials private-staging D1 candidate.
-- Must follow frozen quote, one-time challenge and actor-session source-only
-- candidate schemas on SAME separately authorized isolated D1.
-- Never execute without exact-file/database owner + independent thusico
-- staging approvals and recovery acceptance. No real customer data.
CREATE TABLE essentials_private_session_quotation_challenges (
 challenge_id TEXT PRIMARY KEY NOT NULL,
 session_key_sha256 TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 nonce_sha256 TEXT NOT NULL CHECK(length(nonce_sha256)=64
   AND nonce_sha256 NOT GLOB '*[^0-9a-f]*'),
 nonce_iv BLOB NOT NULL CHECK(length(nonce_iv)=12),
 nonce_ciphertext BLOB NOT NULL
   CHECK(length(nonce_ciphertext) BETWEEN 17 AND 256),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issued_at_ms
   AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','revoked')),
 revoked_at_ms INTEGER,
 CHECK((state='pending' AND revoked_at_ms IS NULL) OR
       (state='revoked' AND revoked_at_ms IS NOT NULL)),
 FOREIGN KEY(session_key_sha256)
  REFERENCES essentials_private_consent_actor_sessions(session_key_sha256),
 FOREIGN KEY(challenge_id)
  REFERENCES essentials_private_one_time_challenges(challenge_id)
);
CREATE UNIQUE INDEX essentials_private_session_one_pending_quote
 ON essentials_private_session_quotation_challenges(
  session_key_sha256,tenant_id,quotation_id
 ) WHERE state='pending';
CREATE INDEX essentials_private_session_challenge_state_expiry
 ON essentials_private_session_quotation_challenges(state,expires_at_ms);
CREATE TRIGGER essentials_private_session_challenge_no_delete BEFORE DELETE
 ON essentials_private_session_quotation_challenges
 BEGIN SELECT RAISE(ABORT,'session_challenge_delete_denied'); END;
CREATE TRIGGER essentials_private_session_challenge_immutable BEFORE UPDATE
 ON essentials_private_session_quotation_challenges
 WHEN OLD.state<>'pending' OR NEW.state<>'revoked'
  OR NEW.revoked_at_ms IS NULL
  OR NEW.challenge_id<>OLD.challenge_id
  OR NEW.session_key_sha256<>OLD.session_key_sha256
  OR NEW.tenant_id<>OLD.tenant_id
  OR NEW.actor_user_id<>OLD.actor_user_id
  OR NEW.quotation_id<>OLD.quotation_id
  OR NEW.customer_id<>OLD.customer_id
  OR NEW.nonce_sha256<>OLD.nonce_sha256
  OR NEW.nonce_iv<>OLD.nonce_iv
  OR NEW.nonce_ciphertext<>OLD.nonce_ciphertext
  OR NEW.issued_at_ms<>OLD.issued_at_ms
  OR NEW.expires_at_ms<>OLD.expires_at_ms
 BEGIN SELECT RAISE(ABORT,'session_challenge_immutable'); END;
