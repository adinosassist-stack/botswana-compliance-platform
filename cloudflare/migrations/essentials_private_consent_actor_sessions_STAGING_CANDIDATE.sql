-- SOURCE ONLY. UNEXECUTED ISOLATED Essentials private staging D1 candidate.
-- NEVER execute without separate exact-file/resource owner and independent
-- thusico approvals plus a protected recovery/rollback preflight.
-- This is a TENANT ACTOR session, NOT verified CUSTOMER identity/consent.
CREATE TABLE essentials_private_consent_actor_sessions (
 session_key_sha256 TEXT PRIMARY KEY NOT NULL
  CHECK(length(session_key_sha256)=64 AND session_key_sha256 NOT GLOB '*[^0-9a-f]*'),
 csrf_sha256 TEXT NOT NULL UNIQUE
  CHECK(length(csrf_sha256)=64 AND csrf_sha256 NOT GLOB '*[^0-9a-f]*'),
 tenant_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 grant_id TEXT NOT NULL UNIQUE,
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 grant_expires_at_ms INTEGER NOT NULL CHECK(grant_expires_at_ms>issued_at_ms),
 expires_at_ms INTEGER NOT NULL
  CHECK(expires_at_ms>issued_at_ms
    AND expires_at_ms<=grant_expires_at_ms
    AND expires_at_ms-issued_at_ms<=600000),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 revoked_at_ms INTEGER,
 CHECK((state='active' AND revoked_at_ms IS NULL) OR
       (state='revoked' AND revoked_at_ms IS NOT NULL))
);
CREATE INDEX essentials_private_actor_session_state_expiry
 ON essentials_private_consent_actor_sessions(state,expires_at_ms);
CREATE TRIGGER essentials_private_actor_session_no_delete BEFORE DELETE
 ON essentials_private_consent_actor_sessions
 BEGIN SELECT RAISE(ABORT,'actor_session_delete_denied'); END;
CREATE TRIGGER essentials_private_actor_session_immutable BEFORE UPDATE
 ON essentials_private_consent_actor_sessions
 WHEN OLD.state<>'active' OR NEW.state<>'revoked'
 OR NEW.revoked_at_ms IS NULL
 OR NEW.session_key_sha256<>OLD.session_key_sha256
 OR NEW.csrf_sha256<>OLD.csrf_sha256
 OR NEW.tenant_id<>OLD.tenant_id
 OR NEW.actor_user_id<>OLD.actor_user_id
 OR NEW.grant_id<>OLD.grant_id
 OR NEW.issued_at_ms<>OLD.issued_at_ms
 OR NEW.grant_expires_at_ms<>OLD.grant_expires_at_ms
 OR NEW.expires_at_ms<>OLD.expires_at_ms
 BEGIN SELECT RAISE(ABORT,'actor_session_immutable'); END;
