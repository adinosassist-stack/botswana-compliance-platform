-- UNEXECUTED SOURCE-ONLY isolated private Essentials staging D1 candidate.
-- Revision to original (never-executed) schema: encrypt sensitive token only
-- while pending. Successful consume or expiry clears IV + ciphertext, while
-- immutable metadata and unique hashed handoff ID remain as replay tombstones.
-- Not guaranteed physical erasure from SQLite pages, D1 replicas, time travel,
-- exports or backups: separate retention/security approval still required.
CREATE TABLE essentials_private_oidc_token_handoffs(
 handoff_key_sha256 TEXT PRIMARY KEY NOT NULL
  CHECK(length(handoff_key_sha256)=64 AND handoff_key_sha256 NOT GLOB '*[^0-9a-f]*'),
 session_key_sha256 TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 challenge_id TEXT NOT NULL UNIQUE,
 customer_id TEXT NOT NULL,
 token_iv BLOB CHECK(token_iv IS NULL OR length(token_iv)=12),
 token_ciphertext BLOB CHECK(token_ciphertext IS NULL OR length(token_ciphertext) BETWEEN 17 AND 8300),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
  expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=120000),
 state TEXT NOT NULL DEFAULT 'pending'
  CHECK(state IN ('pending','consumed','expired')),
 consumed_at_ms INTEGER,
 expired_at_ms INTEGER,
 CHECK(
  (state='pending' AND consumed_at_ms IS NULL AND expired_at_ms IS NULL
   AND token_iv IS NOT NULL AND token_ciphertext IS NOT NULL)
  OR
  (state='consumed' AND consumed_at_ms IS NOT NULL AND expired_at_ms IS NULL
   AND token_iv IS NULL AND token_ciphertext IS NULL)
  OR
  (state='expired' AND consumed_at_ms IS NULL AND expired_at_ms IS NOT NULL
   AND token_iv IS NULL AND token_ciphertext IS NULL)
 ),
 FOREIGN KEY(session_key_sha256) REFERENCES essentials_private_consent_actor_sessions(session_key_sha256),
 FOREIGN KEY(challenge_id) REFERENCES essentials_private_one_time_challenges(challenge_id)
);
CREATE UNIQUE INDEX essentials_private_handoff_nonce_iv_unique
 ON essentials_private_oidc_token_handoffs(token_iv);
CREATE INDEX essentials_private_handoff_pending_expiry
 ON essentials_private_oidc_token_handoffs(state,expires_at_ms);

CREATE TABLE essentials_private_oidc_handoff_erasures(
 handoff_key_sha256 TEXT PRIMARY KEY NOT NULL,
 session_key_sha256 TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 challenge_id TEXT NOT NULL,
 consumed_at_ms INTEGER NOT NULL CHECK(consumed_at_ms>0),
 FOREIGN KEY(handoff_key_sha256)
  REFERENCES essentials_private_oidc_token_handoffs(handoff_key_sha256)
);
-- A zero-row UPDATE in D1 batch is a success. The mandatory THIRD INSERT
-- raises ABORT unless the first guarded SELECT matched and the second UPDATE
-- changed the exact pending handoff to a consumed, ciphertext-free tombstone.
CREATE TRIGGER essentials_private_handoff_assert_erasure
 BEFORE INSERT ON essentials_private_oidc_handoff_erasures
 BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM essentials_private_oidc_token_handoffs AS h
  WHERE h.handoff_key_sha256=NEW.handoff_key_sha256
   AND h.session_key_sha256=NEW.session_key_sha256
   AND h.tenant_id=NEW.tenant_id AND h.actor_user_id=NEW.actor_user_id
   AND h.quotation_id=NEW.quotation_id AND h.challenge_id=NEW.challenge_id
   AND h.state='consumed'
   AND h.consumed_at_ms=NEW.consumed_at_ms
   AND h.token_iv IS NULL AND h.token_ciphertext IS NULL
 ) THEN RAISE(ABORT,'private_oidc_handoff_erasure_required') END;
 END;
CREATE TRIGGER essentials_private_handoff_erasure_no_update
 BEFORE UPDATE ON essentials_private_oidc_handoff_erasures
 BEGIN SELECT RAISE(ABORT,'private_oidc_erasure_audit_immutable'); END;
CREATE TRIGGER essentials_private_handoff_erasure_no_delete
 BEFORE DELETE ON essentials_private_oidc_handoff_erasures
 BEGIN SELECT RAISE(ABORT,'private_oidc_erasure_audit_delete_denied'); END;
CREATE TRIGGER essentials_private_handoff_no_delete
 BEFORE DELETE ON essentials_private_oidc_token_handoffs
 BEGIN SELECT RAISE(ABORT,'private_oidc_handoff_deletion_requires_retention_approval'); END;
CREATE TRIGGER essentials_private_handoff_immutable
 BEFORE UPDATE ON essentials_private_oidc_token_handoffs
 WHEN OLD.state<>'pending' OR NEW.state NOT IN ('consumed','expired')
 OR NEW.handoff_key_sha256<>OLD.handoff_key_sha256
 OR NEW.session_key_sha256<>OLD.session_key_sha256
 OR NEW.tenant_id<>OLD.tenant_id
 OR NEW.actor_user_id<>OLD.actor_user_id
 OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.challenge_id<>OLD.challenge_id
 OR NEW.customer_id<>OLD.customer_id
 OR NEW.issued_at_ms<>OLD.issued_at_ms
 OR NEW.expires_at_ms<>OLD.expires_at_ms
 OR NEW.token_iv IS NOT NULL OR NEW.token_ciphertext IS NOT NULL
 OR (NEW.state='consumed' AND
     (NEW.consumed_at_ms IS NULL OR NEW.expired_at_ms IS NOT NULL))
 OR (NEW.state='expired' AND
     (NEW.expired_at_ms IS NULL OR NEW.consumed_at_ms IS NOT NULL))
 BEGIN SELECT RAISE(ABORT,'private_oidc_handoff_immutable'); END;
