-- UNEXECUTED SOURCE-ONLY. Isolated Essentials private staging D1 candidate.
-- MUST follow frozen quotation and verified identity link staging candidate.
-- Not an invitation issuance workflow, live IdP or production migration.
--
-- Real customer invitation state is created ONLY by a separate independently
-- approved invitation-proof authority (not browser-controlled URL params).
CREATE TABLE essentials_private_customer_consent_invitations(
 invitation_id TEXT PRIMARY KEY NOT NULL,
 tenant_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 nonce_sha256 TEXT NOT NULL CHECK(length(nonce_sha256)=64
   AND nonce_sha256 NOT GLOB '*[^0-9a-f]*'),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
  expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'pending'
   CHECK(state IN ('pending','consumed','revoked')),
 consumed_at_ms INTEGER,
 revoked_at_ms INTEGER,
 CHECK((state='pending' AND consumed_at_ms IS NULL AND revoked_at_ms IS NULL)
  OR (state='consumed' AND consumed_at_ms IS NOT NULL AND revoked_at_ms IS NULL)
  OR (state='revoked' AND consumed_at_ms IS NULL AND revoked_at_ms IS NOT NULL))
);
CREATE INDEX essentials_private_customer_invitation_scope
 ON essentials_private_customer_consent_invitations(
 tenant_id,customer_id,quotation_id,state);
CREATE TRIGGER essentials_private_customer_invitation_no_delete BEFORE DELETE
 ON essentials_private_customer_consent_invitations
 BEGIN SELECT RAISE(ABORT,'customer_invitation_delete_denied'); END;
CREATE TRIGGER essentials_private_customer_invitation_immutable BEFORE UPDATE
 ON essentials_private_customer_consent_invitations
 WHEN OLD.state<>'pending' OR NEW.state NOT IN ('consumed','revoked')
 OR NEW.invitation_id<>OLD.invitation_id
 OR NEW.tenant_id<>OLD.tenant_id
 OR NEW.customer_id<>OLD.customer_id
 OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.nonce_sha256<>OLD.nonce_sha256
 OR NEW.issued_at_ms<>OLD.issued_at_ms
 OR NEW.expires_at_ms<>OLD.expires_at_ms
 OR (NEW.state='consumed' AND
   (NEW.consumed_at_ms IS NULL OR NEW.revoked_at_ms IS NOT NULL))
 OR (NEW.state='revoked' AND
   (NEW.revoked_at_ms IS NULL OR NEW.consumed_at_ms IS NOT NULL))
 BEGIN SELECT RAISE(ABORT,'customer_invitation_immutable'); END;

CREATE TABLE essentials_private_customer_consent_sessions(
 session_key_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(session_key_sha256)=64
  AND session_key_sha256 NOT GLOB '*[^0-9a-f]*'),
 csrf_sha256 TEXT NOT NULL UNIQUE CHECK(length(csrf_sha256)=64
  AND csrf_sha256 NOT GLOB '*[^0-9a-f]*'),
 invitation_id TEXT NOT NULL UNIQUE,
 tenant_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_identity_link_id TEXT NOT NULL,
 consent_subject_id TEXT NOT NULL,
 identity_subject_hmac_sha256 TEXT NOT NULL
  CHECK(length(identity_subject_hmac_sha256)=64
   AND identity_subject_hmac_sha256 NOT GLOB '*[^0-9a-f]*'),
 nonce_sha256 TEXT NOT NULL CHECK(length(nonce_sha256)=64
   AND nonce_sha256 NOT GLOB '*[^0-9a-f]*'),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
  expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 revoked_at_ms INTEGER,
 CHECK((state='active' AND revoked_at_ms IS NULL)
    OR (state='revoked' AND revoked_at_ms IS NOT NULL)),
 FOREIGN KEY(invitation_id)
  REFERENCES essentials_private_customer_consent_invitations(invitation_id),
 FOREIGN KEY(customer_identity_link_id)
  REFERENCES essentials_private_customer_identity_links(link_id)
);
CREATE INDEX essentials_private_customer_session_scope
 ON essentials_private_customer_consent_sessions(
 tenant_id,customer_id,quotation_id,state,expires_at_ms);
CREATE TABLE essentials_private_customer_session_issuance_audit(
 invitation_id TEXT PRIMARY KEY NOT NULL,
 session_key_sha256 TEXT NOT NULL UNIQUE,
 tenant_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 issued_at_ms INTEGER NOT NULL,
 FOREIGN KEY(session_key_sha256)
  REFERENCES essentials_private_customer_consent_sessions(session_key_sha256)
);
-- Third statement of D1 db.batch() is mandatory: challenge consumption
-- without a matching session becomes RAISE(ABORT), rolling back the entire
-- transaction, including a zero-row guarded INSERT ... SELECT.
CREATE TRIGGER essentials_private_customer_session_assert BEFORE INSERT
 ON essentials_private_customer_session_issuance_audit
 BEGIN
 SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM essentials_private_customer_consent_sessions AS s
 JOIN essentials_private_customer_consent_invitations AS i
  ON i.invitation_id=s.invitation_id
 JOIN essentials_private_customer_identity_links AS l
  ON l.link_id=s.customer_identity_link_id
 JOIN essentials_private_frozen_quotes AS q
  ON q.tenant_id=s.tenant_id AND q.quotation_id=s.quotation_id
 WHERE s.invitation_id=NEW.invitation_id
  AND s.session_key_sha256=NEW.session_key_sha256
  AND s.tenant_id=NEW.tenant_id AND s.customer_id=NEW.customer_id
  AND s.quotation_id=NEW.quotation_id
  AND s.issued_at_ms=NEW.issued_at_ms
  AND s.state='active' AND i.state='consumed'
  AND i.consumed_at_ms=NEW.issued_at_ms
  AND i.tenant_id=s.tenant_id AND i.customer_id=s.customer_id
  AND i.quotation_id=s.quotation_id AND i.nonce_sha256=s.nonce_sha256
  AND s.expires_at_ms<=i.expires_at_ms
  AND l.state='active' AND l.tenant_id=s.tenant_id
  AND l.customer_id=s.customer_id
  AND l.subject_hmac_sha256=s.identity_subject_hmac_sha256
  AND l.consent_subject_id=s.consent_subject_id
  AND l.expires_at_ms>=s.expires_at_ms
  AND q.state='accepted' AND q.customer_id=s.customer_id
  AND s.expires_at_ms>
   (CAST(strftime('%s','now') AS INTEGER)*1000
    +CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 ) THEN RAISE(ABORT,'customer_session_issue_unverified') END;
 END;
CREATE TRIGGER essentials_private_customer_session_no_delete BEFORE DELETE
 ON essentials_private_customer_consent_sessions
 BEGIN SELECT RAISE(ABORT,'customer_session_delete_denied'); END;
CREATE TRIGGER essentials_private_customer_session_immutable BEFORE UPDATE
 ON essentials_private_customer_consent_sessions
 WHEN OLD.state<>'active' OR NEW.state<>'revoked'
 OR NEW.revoked_at_ms IS NULL
 OR NEW.session_key_sha256<>OLD.session_key_sha256
 OR NEW.csrf_sha256<>OLD.csrf_sha256
 OR NEW.invitation_id<>OLD.invitation_id
 OR NEW.tenant_id<>OLD.tenant_id
 OR NEW.customer_id<>OLD.customer_id
 OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.customer_identity_link_id<>OLD.customer_identity_link_id
 OR NEW.consent_subject_id<>OLD.consent_subject_id
 OR NEW.identity_subject_hmac_sha256<>OLD.identity_subject_hmac_sha256
 OR NEW.nonce_sha256<>OLD.nonce_sha256
 OR NEW.issued_at_ms<>OLD.issued_at_ms
 OR NEW.expires_at_ms<>OLD.expires_at_ms
 BEGIN SELECT RAISE(ABORT,'customer_session_immutable'); END;
CREATE TRIGGER essentials_private_customer_session_audit_no_update BEFORE UPDATE
 ON essentials_private_customer_session_issuance_audit
 BEGIN SELECT RAISE(ABORT,'customer_session_audit_immutable'); END;
CREATE TRIGGER essentials_private_customer_session_audit_no_delete BEFORE DELETE
 ON essentials_private_customer_session_issuance_audit
 BEGIN SELECT RAISE(ABORT,'customer_session_audit_delete_denied'); END;
