-- SINGLE CONSOLIDATED CUSTOMER INVITATION + OIDC STAGING CANDIDATE.
-- UNEXECUTED / PRIVATE ISOLATED D1 ONLY. DO NOT bind Finance/production.
-- Requires existing frozen quote+FULL terms, approved identity link,
-- separately verified customer session invitation schemas.
-- All sensitive ticket/verifier/cookie values are hashed or AES-GCM encrypted.
CREATE TABLE essentials_private_customer_invitation_launches (
 invitation_id TEXT PRIMARY KEY NOT NULL,
 customer_identity_link_id TEXT NOT NULL,
 ticket_sha256 TEXT NOT NULL UNIQUE
  CHECK(length(ticket_sha256)=64 AND ticket_sha256 NOT GLOB '*[^a-f0-9]*'),
 nonce_iv BLOB NOT NULL CHECK(length(nonce_iv)=12),
 nonce_ciphertext BLOB NOT NULL CHECK(length(nonce_ciphertext) BETWEEN 17 AND 256),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
  expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','started','revoked')),
 started_at_ms INTEGER,
 revoked_at_ms INTEGER,
 CHECK((state='issued' AND started_at_ms IS NULL AND revoked_at_ms IS NULL) OR
       (state='started' AND started_at_ms IS NOT NULL AND revoked_at_ms IS NULL) OR
       (state='revoked' AND revoked_at_ms IS NOT NULL)),
 FOREIGN KEY(invitation_id) REFERENCES essentials_private_customer_consent_invitations(invitation_id),
 FOREIGN KEY(customer_identity_link_id) REFERENCES essentials_private_customer_identity_links(link_id)
);
CREATE UNIQUE INDEX essentials_private_invite_nonce_iv_unique
 ON essentials_private_customer_invitation_launches(nonce_iv);
CREATE TABLE essentials_private_customer_invite_issue_audit(
 invitation_id TEXT PRIMARY KEY NOT NULL,
 issued_at_ms INTEGER NOT NULL,
 FOREIGN KEY(invitation_id) REFERENCES essentials_private_customer_invitation_launches(invitation_id)
);
CREATE TRIGGER essentials_private_customer_invite_issue_assert
 BEFORE INSERT ON essentials_private_customer_invite_issue_audit
 BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM essentials_private_customer_invitation_launches AS x
  JOIN essentials_private_customer_consent_invitations AS i
   ON i.invitation_id=x.invitation_id
  JOIN essentials_private_customer_identity_links AS l
   ON l.link_id=x.customer_identity_link_id
  JOIN essentials_private_frozen_quotes AS q
   ON q.tenant_id=i.tenant_id AND q.quotation_id=i.quotation_id
  JOIN essentials_private_frozen_quote_terms AS t
   ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id
  JOIN essentials_private_frozen_quote_terms_audit AS f
   ON f.tenant_id=q.tenant_id AND f.quotation_id=q.quotation_id
  WHERE i.invitation_id=NEW.invitation_id AND x.state='issued'
   AND i.state='pending' AND i.nonce_sha256 IS NOT NULL
   AND x.issued_at_ms=NEW.issued_at_ms AND i.issued_at_ms=x.issued_at_ms
   AND i.expires_at_ms=x.expires_at_ms
   AND l.tenant_id=i.tenant_id AND l.customer_id=i.customer_id
   AND l.state='active' AND l.expires_at_ms>x.issued_at_ms
   AND q.state='accepted' AND q.customer_id=i.customer_id
   AND t.customer_id=q.customer_id
   AND t.quotation_sha256=q.quotation_sha256
   AND t.terms_sha256=f.terms_sha256
   AND f.quotation_sha256=q.quotation_sha256
   AND f.frozen_at=q.frozen_at AND t.frozen_at=q.frozen_at
 ) THEN RAISE(ABORT,'private_customer_invite_issue_unverified') END;
 END;
CREATE TRIGGER essentials_private_customer_launch_no_delete
 BEFORE DELETE ON essentials_private_customer_invitation_launches
 BEGIN SELECT RAISE(ABORT,'private_customer_invite_delete_denied'); END;
CREATE TRIGGER essentials_private_customer_launch_immutable
 BEFORE UPDATE ON essentials_private_customer_invitation_launches
 WHEN OLD.state<>'issued' OR NEW.state NOT IN ('started','revoked')
 OR NEW.invitation_id IS NOT OLD.invitation_id
 OR NEW.customer_identity_link_id IS NOT OLD.customer_identity_link_id
 OR NEW.ticket_sha256 IS NOT OLD.ticket_sha256
 OR NEW.nonce_iv IS NOT OLD.nonce_iv
 OR NEW.nonce_ciphertext IS NOT OLD.nonce_ciphertext
 OR NEW.issued_at_ms IS NOT OLD.issued_at_ms
 OR NEW.expires_at_ms IS NOT OLD.expires_at_ms
 OR (NEW.state='started' AND NEW.started_at_ms IS NULL)
 OR (NEW.state='revoked' AND NEW.revoked_at_ms IS NULL)
 BEGIN SELECT RAISE(ABORT,'private_customer_invite_immutable'); END;

CREATE TABLE essentials_private_customer_oidc_logins (
 attempt_id TEXT PRIMARY KEY NOT NULL,
 invitation_id TEXT NOT NULL UNIQUE,
 state_sha256 TEXT NOT NULL UNIQUE CHECK(length(state_sha256)=64
  AND state_sha256 NOT GLOB '*[^a-f0-9]*'),
 oauth_cookie_sha256 TEXT NOT NULL UNIQUE CHECK(length(oauth_cookie_sha256)=64
  AND oauth_cookie_sha256 NOT GLOB '*[^a-f0-9]*'),
 verifier_iv BLOB NOT NULL CHECK(length(verifier_iv)=12),
 verifier_ciphertext BLOB NOT NULL CHECK(length(verifier_ciphertext) BETWEEN 17 AND 256),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(
  expires_at_ms>issued_at_ms AND expires_at_ms-issued_at_ms<=300000),
 state TEXT NOT NULL DEFAULT 'pending'
  CHECK(state IN ('pending','consumed','revoked')),
 consumed_at_ms INTEGER,
 CHECK((state='pending' AND consumed_at_ms IS NULL)
    OR (state IN ('consumed','revoked') AND consumed_at_ms IS NOT NULL)),
 FOREIGN KEY(invitation_id)
 REFERENCES essentials_private_customer_invitation_launches(invitation_id)
);
CREATE UNIQUE INDEX essentials_private_customer_oidc_iv_unique
 ON essentials_private_customer_oidc_logins(verifier_iv);
CREATE TABLE essentials_private_customer_oidc_start_audit(
 invitation_id TEXT PRIMARY KEY NOT NULL,
 attempt_id TEXT NOT NULL UNIQUE,
 started_at_ms INTEGER NOT NULL CHECK(started_at_ms>0),
 FOREIGN KEY(attempt_id) REFERENCES essentials_private_customer_oidc_logins(attempt_id)
);
-- START OIDC is a D1 db.batch:
-- (1) launched invite 'issued' -> 'started'
-- (2) insert bound encrypted PKCE attempt
-- (3) mandatory assertion: fail SQL RAISE(ABORT) on any zero-row operation
CREATE TRIGGER essentials_private_customer_oidc_start_assert
 BEFORE INSERT ON essentials_private_customer_oidc_start_audit
 BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM essentials_private_customer_oidc_logins AS o
  JOIN essentials_private_customer_invitation_launches AS x
   ON x.invitation_id=o.invitation_id
  JOIN essentials_private_customer_consent_invitations AS i
   ON i.invitation_id=x.invitation_id
  JOIN essentials_private_customer_identity_links AS l
   ON l.link_id=x.customer_identity_link_id
  WHERE o.invitation_id=NEW.invitation_id
    AND o.attempt_id=NEW.attempt_id
    AND x.state='started'
    AND x.started_at_ms=NEW.started_at_ms
    AND o.issued_at_ms=NEW.started_at_ms
    AND o.state='pending' AND i.state='pending'
    AND o.expires_at_ms<=x.expires_at_ms
    AND l.tenant_id=i.tenant_id AND l.customer_id=i.customer_id
    AND l.state='active' AND l.expires_at_ms>NEW.started_at_ms
 ) THEN RAISE(ABORT,'private_customer_oidc_start_unverified') END;
 END;
CREATE TRIGGER essentials_private_customer_oidc_no_delete
 BEFORE DELETE ON essentials_private_customer_oidc_logins
 BEGIN SELECT RAISE(ABORT,'private_customer_oidc_delete_denied'); END;
CREATE TRIGGER essentials_private_customer_oidc_immutable
 BEFORE UPDATE ON essentials_private_customer_oidc_logins
 WHEN OLD.state<>'pending' OR NEW.state NOT IN ('consumed','revoked')
 OR NEW.attempt_id IS NOT OLD.attempt_id
 OR NEW.invitation_id IS NOT OLD.invitation_id
 OR NEW.state_sha256 IS NOT OLD.state_sha256
 OR NEW.oauth_cookie_sha256 IS NOT OLD.oauth_cookie_sha256
 OR NEW.verifier_iv IS NOT OLD.verifier_iv
 OR NEW.verifier_ciphertext IS NOT OLD.verifier_ciphertext
 OR NEW.issued_at_ms IS NOT OLD.issued_at_ms
 OR NEW.expires_at_ms IS NOT OLD.expires_at_ms
 OR NEW.consumed_at_ms IS NULL
 BEGIN SELECT RAISE(ABORT,'private_customer_oidc_immutable'); END;
CREATE TRIGGER essentials_private_customer_launch_audit_immutable
 BEFORE UPDATE ON essentials_private_customer_invite_issue_audit
 BEGIN SELECT RAISE(ABORT,'private_invite_audit_immutable'); END;
CREATE TRIGGER essentials_private_customer_launch_audit_no_delete
 BEFORE DELETE ON essentials_private_customer_invite_issue_audit
 BEGIN SELECT RAISE(ABORT,'private_invite_audit_delete_denied'); END;
CREATE TRIGGER essentials_private_customer_oidc_audit_immutable
 BEFORE UPDATE ON essentials_private_customer_oidc_start_audit
 BEGIN SELECT RAISE(ABORT,'private_oidc_audit_immutable'); END;
CREATE TRIGGER essentials_private_customer_oidc_audit_no_delete
 BEFORE DELETE ON essentials_private_customer_oidc_start_audit
 BEGIN SELECT RAISE(ABORT,'private_oidc_audit_delete_denied'); END;
