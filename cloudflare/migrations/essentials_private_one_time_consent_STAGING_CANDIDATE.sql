-- SOURCE ONLY: ISOLATED PRIVATE STAGING D1 CANDIDATE. DO NOT EXECUTE.
-- Requires the existing essentials_private_consent_authority_STAGING_CANDIDATE.sql
-- in the SAME newly approved isolated D1. No public/private routes, Finance or writes.
-- The trusted OIDC host MUST separately verify customer identity and quote view.
PRAGMA foreign_keys=ON;

CREATE TABLE essentials_private_one_time_challenges (
 challenge_id TEXT PRIMARY KEY NOT NULL,
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_reference TEXT NOT NULL,
 acceptance_version INTEGER NOT NULL CHECK(acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 quotation_sha256 TEXT NOT NULL CHECK(length(quotation_sha256)=64 AND quotation_sha256 NOT GLOB '*[^0-9a-f]*'),
 nonce_sha256 TEXT NOT NULL CHECK(length(nonce_sha256)=64 AND nonce_sha256 NOT GLOB '*[^0-9a-f]*'),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','consumed','revoked')),
 consumed_at TEXT,
 FOREIGN KEY(tenant_id,quotation_id) REFERENCES essentials_private_frozen_quotes(tenant_id,quotation_id),
 CHECK((state='consumed' AND consumed_at IS NOT NULL) OR
       (state IN ('pending','revoked') AND consumed_at IS NULL))
);
CREATE UNIQUE INDEX essentials_private_one_pending_challenge
 ON essentials_private_one_time_challenges(tenant_id,quotation_id)
 WHERE state='pending';
CREATE UNIQUE INDEX essentials_private_challenge_nonce_unique
 ON essentials_private_one_time_challenges(nonce_sha256);
CREATE TRIGGER essentials_private_challenge_protect BEFORE UPDATE
 ON essentials_private_one_time_challenges
 WHEN NEW.challenge_id<>OLD.challenge_id OR NEW.tenant_id<>OLD.tenant_id
 OR NEW.quotation_id<>OLD.quotation_id OR NEW.customer_id<>OLD.customer_id
 OR NEW.actor_user_id<>OLD.actor_user_id
 OR NEW.quotation_reference<>OLD.quotation_reference
 OR NEW.acceptance_version<>OLD.acceptance_version
 OR NEW.total_minor<>OLD.total_minor OR NEW.quotation_sha256<>OLD.quotation_sha256
 OR NEW.nonce_sha256<>OLD.nonce_sha256 OR NEW.issued_at_ms<>OLD.issued_at_ms
 OR NEW.expires_at_ms<>OLD.expires_at_ms OR OLD.state<>'pending'
 OR NEW.state NOT IN ('consumed','revoked')
 OR (NEW.state='consumed' AND NEW.consumed_at IS NULL)
 OR (NEW.state='revoked' AND NEW.consumed_at IS NOT NULL)
 BEGIN SELECT RAISE(ABORT,'one_time_challenge_immutable'); END;
CREATE TRIGGER essentials_private_challenge_no_delete BEFORE DELETE
 ON essentials_private_one_time_challenges
 BEGIN SELECT RAISE(ABORT,'one_time_challenge_delete_denied'); END;

-- Audit evidence from a trusted, PINNED OIDC and account-linking service only.
-- SQLite does NOT cryptographically verify the JWT or SHA-256 BLOB digests.
CREATE TABLE essentials_private_capture_attestations (
 challenge_id TEXT PRIMARY KEY NOT NULL,
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_reference TEXT NOT NULL,
 acceptance_version INTEGER NOT NULL CHECK(acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 quotation_sha256 TEXT NOT NULL CHECK(length(quotation_sha256)=64 AND quotation_sha256 NOT GLOB '*[^0-9a-f]*'),
 nonce_sha256 TEXT NOT NULL CHECK(length(nonce_sha256)=64 AND nonce_sha256 NOT GLOB '*[^0-9a-f]*'),
 consent_sha256 TEXT NOT NULL CHECK(length(consent_sha256)=64 AND consent_sha256 NOT GLOB '*[^0-9a-f]*'),
 immutable_consent_bytes BLOB NOT NULL CHECK(length(immutable_consent_bytes) BETWEEN 1 AND 131072),
 consent_subject_id TEXT NOT NULL CHECK(length(consent_subject_id)>0),
 accepted_at TEXT NOT NULL,
 accepted_at_ms INTEGER NOT NULL CHECK(accepted_at_ms>0),
 UNIQUE(tenant_id,quotation_id),
 FOREIGN KEY(challenge_id) REFERENCES essentials_private_one_time_challenges(challenge_id),
 FOREIGN KEY(tenant_id,quotation_id) REFERENCES essentials_private_frozen_quotes(tenant_id,quotation_id)
);
CREATE TRIGGER essentials_private_attestation_no_update BEFORE UPDATE
 ON essentials_private_capture_attestations
 BEGIN SELECT RAISE(ABORT,'capture_attestation_immutable'); END;
CREATE TRIGGER essentials_private_attestation_no_delete BEFORE DELETE
 ON essentials_private_capture_attestations
 BEGIN SELECT RAISE(ABORT,'capture_attestation_delete_denied'); END;

-- One outer INSERT is a SQLite transaction, so EITHER BOTH downstream
-- changes commit, OR the entire insertion is rolled back. Any failed or
-- zero-row trigger write raises ABORT. Never split these into separate runs.
CREATE TRIGGER essentials_private_capture_commit AFTER INSERT
 ON essentials_private_capture_attestations
 BEGIN
  INSERT INTO essentials_private_verified_consents
   (tenant_id,quotation_id,customer_id,quotation_reference,acceptance_version,
    total_minor,quotation_sha256,consent_sha256,immutable_consent_bytes,
    consent_subject_id,actor_user_id,accepted_at)
  SELECT q.tenant_id,q.quotation_id,q.customer_id,q.quotation_reference,
         q.acceptance_version,q.total_minor,q.quotation_sha256,NEW.consent_sha256,
         NEW.immutable_consent_bytes,NEW.consent_subject_id,NEW.actor_user_id,NEW.accepted_at
  FROM essentials_private_one_time_challenges AS ch
  JOIN essentials_private_frozen_quotes AS q
    ON q.tenant_id=ch.tenant_id AND q.quotation_id=ch.quotation_id
  WHERE ch.challenge_id=NEW.challenge_id AND ch.state='pending'
    AND q.state='accepted' AND q.tenant_id=NEW.tenant_id
    AND q.quotation_id=NEW.quotation_id
    AND q.customer_id=NEW.customer_id
    AND q.quotation_reference=NEW.quotation_reference
    AND q.acceptance_version=NEW.acceptance_version
    AND q.total_minor=NEW.total_minor
    AND q.quotation_sha256=NEW.quotation_sha256
    AND ch.customer_id=q.customer_id
    AND ch.quotation_reference=q.quotation_reference
    AND ch.acceptance_version=q.acceptance_version
    AND ch.total_minor=q.total_minor
    AND ch.quotation_sha256=q.quotation_sha256
    AND ch.actor_user_id=NEW.actor_user_id
    AND ch.nonce_sha256=NEW.nonce_sha256
    AND ch.issued_at_ms<=(CAST(strftime('%s','now') AS INTEGER)*1000)
    AND ch.expires_at_ms>(CAST(strftime('%s','now') AS INTEGER)*1000)
    AND ABS(NEW.accepted_at_ms-(CAST(strftime('%s','now') AS INTEGER)*1000))<=60000;
  SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'capture_guard_rejected') END;
  UPDATE essentials_private_one_time_challenges SET
    state='consumed',consumed_at=NEW.accepted_at
  WHERE challenge_id=NEW.challenge_id AND state='pending'
    AND nonce_sha256=NEW.nonce_sha256;
  SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'capture_consume_failed') END;
 END;
