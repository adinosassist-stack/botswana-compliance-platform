-- SOURCE ONLY; DO NOT EXECUTE. Isolated Essentials private-staging D1 ONLY.
-- This is a non-authoritative identity-link registry. A row alone does not
-- prove customer ownership. Independent IdP login, host session and
-- out-of-band ownership proof are mandatory, as is current Finance mapping.
-- Write/provision/revoke endpoints are NOT implemented or approved here.
CREATE TABLE essentials_private_customer_identity_links(
 link_id TEXT PRIMARY KEY NOT NULL,
 issuer TEXT NOT NULL CHECK(substr(issuer,1,8)='https://'),
 subject_hmac_sha256 TEXT NOT NULL
  CHECK(length(subject_hmac_sha256)=64 AND subject_hmac_sha256 NOT GLOB '*[^a-f0-9]*'),
 tenant_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 consent_subject_id TEXT NOT NULL UNIQUE,
 provisioned_by_actor_user_id TEXT NOT NULL,
 proof_reference_sha256 TEXT NOT NULL
  CHECK(length(proof_reference_sha256)=64 AND proof_reference_sha256 NOT GLOB '*[^a-f0-9]*'),
 proof_verified_at_ms INTEGER NOT NULL CHECK(proof_verified_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>proof_verified_at_ms),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','revoked')),
 revoked_at_ms INTEGER,
 CHECK((state='active' AND revoked_at_ms IS NULL) OR
       (state='revoked' AND revoked_at_ms IS NOT NULL)),
 UNIQUE(issuer,subject_hmac_sha256),
 UNIQUE(tenant_id,customer_id)
);
CREATE INDEX essentials_private_identity_tenant_customer
 ON essentials_private_customer_identity_links(tenant_id,customer_id,state);
CREATE TRIGGER essentials_private_customer_link_immutable BEFORE UPDATE
 ON essentials_private_customer_identity_links
 WHEN NEW.link_id<>OLD.link_id OR NEW.issuer<>OLD.issuer
 OR NEW.subject_hmac_sha256<>OLD.subject_hmac_sha256
 OR NEW.tenant_id<>OLD.tenant_id OR NEW.customer_id<>OLD.customer_id
 OR NEW.consent_subject_id<>OLD.consent_subject_id
 OR NEW.provisioned_by_actor_user_id<>OLD.provisioned_by_actor_user_id
 OR NEW.proof_reference_sha256<>OLD.proof_reference_sha256
 OR NEW.proof_verified_at_ms<>OLD.proof_verified_at_ms
 OR NEW.expires_at_ms<>OLD.expires_at_ms
 OR OLD.state<>'active' OR NEW.state<>'revoked'
 OR NEW.revoked_at_ms IS NULL
 BEGIN SELECT RAISE(ABORT,'customer_identity_link_immutable'); END;
CREATE TRIGGER essentials_private_customer_link_no_delete BEFORE DELETE
 ON essentials_private_customer_identity_links
 BEGIN SELECT RAISE(ABORT,'customer_identity_link_delete_denied'); END;
