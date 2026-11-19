-- UNEXECUTED SOURCE-ONLY isolated private Essentials staging D1 candidate.
-- After private quote, actor session, one-time challenge and bound-session
-- schemas. No live customer identities, production data or cloud resources.
-- Sensitive encrypted ID-token bytes need an independently approved retention
-- and crypto-erasure implementation before ANY operational staging activation.
CREATE TABLE essentials_private_oidc_token_handoffs(
 handoff_key_sha256 TEXT PRIMARY KEY NOT NULL
  CHECK(length(handoff_key_sha256)=64 AND handoff_key_sha256 NOT GLOB '*[^0-9a-f]*'),
 session_key_sha256 TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 challenge_id TEXT NOT NULL UNIQUE,
 customer_id TEXT NOT NULL,
 token_iv BLOB NOT NULL CHECK(length(token_iv)=12),
 token_ciphertext BLOB NOT NULL CHECK(length(token_ciphertext) BETWEEN 17 AND 8300),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
  expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=120000),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','consumed')),
 consumed_at_ms INTEGER,
 CHECK((state='pending' AND consumed_at_ms IS NULL)
    OR (state='consumed' AND consumed_at_ms IS NOT NULL)),
 FOREIGN KEY(session_key_sha256) REFERENCES essentials_private_consent_actor_sessions(session_key_sha256),
 FOREIGN KEY(challenge_id) REFERENCES essentials_private_one_time_challenges(challenge_id)
);
CREATE UNIQUE INDEX essentials_private_handoff_nonce_iv_unique
 ON essentials_private_oidc_token_handoffs(token_iv);
CREATE INDEX essentials_private_handoff_pending_expiry
 ON essentials_private_oidc_token_handoffs(state,expires_at_ms);
CREATE TRIGGER essentials_private_handoff_no_delete
 BEFORE DELETE ON essentials_private_oidc_token_handoffs
 BEGIN SELECT RAISE(ABORT,'private_oidc_handoff_deletion_requires_retention_approval'); END;
CREATE TRIGGER essentials_private_handoff_immutable
 BEFORE UPDATE ON essentials_private_oidc_token_handoffs
 WHEN OLD.state<>'pending' OR NEW.state<>'consumed'
 OR NEW.consumed_at_ms IS NULL
 OR NEW.handoff_key_sha256<>OLD.handoff_key_sha256
 OR NEW.session_key_sha256<>OLD.session_key_sha256
 OR NEW.tenant_id<>OLD.tenant_id
 OR NEW.actor_user_id<>OLD.actor_user_id
 OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.challenge_id<>OLD.challenge_id
 OR NEW.customer_id<>OLD.customer_id
 OR NEW.token_iv<>OLD.token_iv
 OR NEW.token_ciphertext<>OLD.token_ciphertext
 OR NEW.issued_at_ms<>OLD.issued_at_ms
 OR NEW.expires_at_ms<>OLD.expires_at_ms
 BEGIN SELECT RAISE(ABORT,'private_oidc_handoff_immutable'); END;
