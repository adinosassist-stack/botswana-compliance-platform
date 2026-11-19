-- CONSOLIDATED SOURCE-ONLY customer-specific consent/receipt candidate.
-- NEVER EXECUTED. Requires isolated staging authority, identity links,
-- verified CUSTOMER sessions and full-terms review schemas on SAME D1.
-- No employee-actor consent schema, Finance DB or production routes.
PRAGMA foreign_keys=ON;
CREATE TABLE essentials_private_customer_verified_acceptances(
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 presentation_id TEXT NOT NULL UNIQUE,
 session_key_sha256 TEXT NOT NULL,
 customer_identity_link_id TEXT NOT NULL,
 identity_issuer TEXT NOT NULL,
 consent_subject_id TEXT NOT NULL,
 identity_subject_hmac_sha256 TEXT NOT NULL CHECK(
  length(identity_subject_hmac_sha256)=64 AND identity_subject_hmac_sha256 NOT GLOB '*[^0-9a-f]*'),
 quotation_sha256 TEXT NOT NULL CHECK(
  length(quotation_sha256)=64 AND quotation_sha256 NOT GLOB '*[^0-9a-f]*'),
 terms_sha256 TEXT NOT NULL CHECK(
  length(terms_sha256)=64 AND terms_sha256 NOT GLOB '*[^0-9a-f]*'),
 acceptance_version INTEGER NOT NULL CHECK(acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 authentication_proof_sha256 TEXT NOT NULL CHECK(
  length(authentication_proof_sha256)=64 AND authentication_proof_sha256 NOT GLOB '*[^0-9a-f]*'),
 acceptance_sha256 TEXT NOT NULL CHECK(
  length(acceptance_sha256)=64 AND acceptance_sha256 NOT GLOB '*[^0-9a-f]*'),
 immutable_acceptance_bytes BLOB NOT NULL CHECK(length(immutable_acceptance_bytes) BETWEEN 1 AND 8192),
 server_hmac_sha256 TEXT NOT NULL CHECK(
  length(server_hmac_sha256)=64 AND server_hmac_sha256 NOT GLOB '*[^0-9a-f]*'),
 accepted_at_ms INTEGER NOT NULL CHECK(accepted_at_ms>0),
 state TEXT NOT NULL DEFAULT 'accepted' CHECK(state IN ('accepted','revoked')),
 revoked_at_ms INTEGER,
 CHECK((state='accepted' AND revoked_at_ms IS NULL) OR
       (state='revoked' AND revoked_at_ms IS NOT NULL)),
 PRIMARY KEY(tenant_id,quotation_id),
 FOREIGN KEY(presentation_id)
  REFERENCES essentials_private_customer_quote_review_offers(presentation_id),
 FOREIGN KEY(session_key_sha256)
  REFERENCES essentials_private_customer_consent_sessions(session_key_sha256),
 FOREIGN KEY(customer_identity_link_id)
  REFERENCES essentials_private_customer_identity_links(link_id),
 FOREIGN KEY(tenant_id,quotation_id)
  REFERENCES essentials_private_frozen_quote_terms(tenant_id,quotation_id)
);
CREATE TRIGGER essentials_private_customer_acceptance_immutable
 BEFORE UPDATE ON essentials_private_customer_verified_acceptances
 WHEN OLD.state<>'accepted' OR NEW.state<>'revoked' OR NEW.revoked_at_ms IS NULL
 OR NEW.tenant_id IS NOT OLD.tenant_id
 OR NEW.quotation_id IS NOT OLD.quotation_id
 OR NEW.customer_id IS NOT OLD.customer_id
 OR NEW.presentation_id IS NOT OLD.presentation_id
 OR NEW.session_key_sha256 IS NOT OLD.session_key_sha256
 OR NEW.customer_identity_link_id IS NOT OLD.customer_identity_link_id
 OR NEW.identity_issuer IS NOT OLD.identity_issuer
 OR NEW.consent_subject_id IS NOT OLD.consent_subject_id
 OR NEW.identity_subject_hmac_sha256 IS NOT OLD.identity_subject_hmac_sha256
 OR NEW.quotation_sha256 IS NOT OLD.quotation_sha256
 OR NEW.terms_sha256 IS NOT OLD.terms_sha256
 OR NEW.acceptance_version IS NOT OLD.acceptance_version
 OR NEW.total_minor IS NOT OLD.total_minor
 OR NEW.authentication_proof_sha256 IS NOT OLD.authentication_proof_sha256
 OR NEW.acceptance_sha256 IS NOT OLD.acceptance_sha256
 OR NEW.immutable_acceptance_bytes IS NOT OLD.immutable_acceptance_bytes
 OR NEW.server_hmac_sha256 IS NOT OLD.server_hmac_sha256
 OR NEW.accepted_at_ms IS NOT OLD.accepted_at_ms
 BEGIN SELECT RAISE(ABORT,'customer_acceptance_immutable'); END;
CREATE TRIGGER essentials_private_customer_acceptance_no_delete
 BEFORE DELETE ON essentials_private_customer_verified_acceptances
 BEGIN SELECT RAISE(ABORT,'customer_acceptance_delete_denied'); END;

CREATE TABLE essentials_private_customer_acceptance_audit(
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 presentation_id TEXT NOT NULL UNIQUE,
 session_key_sha256 TEXT NOT NULL,
 acceptance_sha256 TEXT NOT NULL,
 committed_at_ms INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,quotation_id),
 FOREIGN KEY(tenant_id,quotation_id)
 REFERENCES essentials_private_customer_verified_acceptances(tenant_id,quotation_id)
);
-- Third unconditional batch INSERT ABORTs if the first guarded offer UPDATE
-- silently changed zero rows, or the second guarded acceptance INSERT wrote
-- zero rows. This rolls back ALL statements, preventing "consumed but absent
-- consent" or "consent but unconsumed offer" partial outcomes.
CREATE TRIGGER essentials_private_customer_acceptance_assert
 BEFORE INSERT ON essentials_private_customer_acceptance_audit
 BEGIN SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM essentials_private_customer_verified_acceptances AS c
 JOIN essentials_private_customer_quote_review_offers AS o
  ON o.presentation_id=c.presentation_id
 JOIN essentials_private_customer_consent_sessions AS s
  ON s.session_key_sha256=c.session_key_sha256
 JOIN essentials_private_customer_identity_links AS l
  ON l.link_id=c.customer_identity_link_id
 JOIN essentials_private_frozen_quotes AS q
  ON q.tenant_id=c.tenant_id AND q.quotation_id=c.quotation_id
 JOIN essentials_private_frozen_quote_terms AS t
  ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id
 JOIN essentials_private_frozen_quote_terms_audit AS f
  ON f.tenant_id=q.tenant_id AND f.quotation_id=q.quotation_id
 WHERE c.tenant_id=NEW.tenant_id AND c.quotation_id=NEW.quotation_id
 AND c.presentation_id=NEW.presentation_id
 AND c.session_key_sha256=NEW.session_key_sha256
 AND c.acceptance_sha256=NEW.acceptance_sha256
 AND c.accepted_at_ms=NEW.committed_at_ms
 AND c.state='accepted' AND o.state='consumed'
 AND o.used_at_ms=c.accepted_at_ms
 AND o.session_key_sha256=c.session_key_sha256
 AND o.tenant_id=c.tenant_id AND o.customer_id=c.customer_id
 AND o.quotation_id=c.quotation_id
 AND o.quotation_sha256=c.quotation_sha256
 AND o.terms_sha256=c.terms_sha256
 AND o.acceptance_version=c.acceptance_version
 AND o.total_minor=c.total_minor
 AND s.state='active' AND s.tenant_id=c.tenant_id
 AND s.customer_id=c.customer_id AND s.quotation_id=c.quotation_id
 AND s.customer_identity_link_id=c.customer_identity_link_id
 AND s.consent_subject_id=c.consent_subject_id
 AND s.identity_subject_hmac_sha256=c.identity_subject_hmac_sha256
 AND s.expires_at_ms>c.accepted_at_ms
 AND l.state='active' AND l.tenant_id=c.tenant_id
 AND l.customer_id=c.customer_id AND l.issuer=c.identity_issuer
 AND l.consent_subject_id=c.consent_subject_id
 AND l.subject_hmac_sha256=c.identity_subject_hmac_sha256
 AND l.expires_at_ms>c.accepted_at_ms
 AND q.state='accepted' AND q.customer_id=c.customer_id
 AND q.quotation_sha256=c.quotation_sha256
 AND q.acceptance_version=c.acceptance_version AND q.total_minor=c.total_minor
 AND t.terms_sha256=c.terms_sha256
 AND t.quotation_sha256=q.quotation_sha256
 AND t.customer_id=q.customer_id AND t.quotation_reference=q.quotation_reference
 AND t.acceptance_version=q.acceptance_version AND t.total_minor=q.total_minor
 AND t.frozen_at=q.frozen_at
 AND f.quotation_sha256=q.quotation_sha256 AND f.terms_sha256=t.terms_sha256
 AND f.frozen_at=q.frozen_at
 ) THEN RAISE(ABORT,'customer_acceptance_atomic_lineage_required') END;
 END;
CREATE TRIGGER essentials_private_customer_acceptance_audit_no_update
 BEFORE UPDATE ON essentials_private_customer_acceptance_audit
 BEGIN SELECT RAISE(ABORT,'customer_acceptance_audit_immutable'); END;
CREATE TRIGGER essentials_private_customer_acceptance_audit_no_delete
 BEFORE DELETE ON essentials_private_customer_acceptance_audit
 BEGIN SELECT RAISE(ABORT,'customer_acceptance_audit_delete_denied'); END;
