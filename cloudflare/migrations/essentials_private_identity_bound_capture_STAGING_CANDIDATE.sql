-- SOURCE-ONLY additive ISOLATED Essentials private-staging D1 guard candidate.
-- DO NOT EXECUTE, DEPLOY OR BIND to ANY database without separate explicit
-- exact-file/SHA/D1 owner and independent thusico approvals + recovery preflight.
-- Apply AFTER the unexecuted private authority, one-time-challenge and
-- private customer identity links staging candidate schemas in ONE isolated D1.
-- No existing production databases, Finance, billing or customer traffic.
-- This prevents a revoked, expired or different identity link being used at
-- the SAME atomic consent INSERT boundary. It does NOT authenticate an IdP.
CREATE TRIGGER essentials_private_capture_requires_current_identity_link
 BEFORE INSERT ON essentials_private_capture_attestations
 BEGIN
  SELECT CASE WHEN json_valid(CAST(NEW.immutable_consent_bytes AS TEXT))<>1
    THEN RAISE(ABORT,'invalid_consent_evidence_json') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM essentials_private_customer_identity_links AS link
    WHERE link.link_id=json_extract(CAST(NEW.immutable_consent_bytes AS TEXT),
       '$.customerIdentityLinkId')
      AND link.issuer=json_extract(CAST(NEW.immutable_consent_bytes AS TEXT),
       '$.identityIssuer')
      AND link.subject_hmac_sha256=json_extract(
        CAST(NEW.immutable_consent_bytes AS TEXT),'$.identitySubjectHmacSha256')
      AND link.consent_subject_id=NEW.consent_subject_id
      AND link.consent_subject_id=json_extract(
        CAST(NEW.immutable_consent_bytes AS TEXT),'$.consentSubjectId')
      AND link.tenant_id=NEW.tenant_id
      AND link.customer_id=NEW.customer_id
      AND link.state='active' AND link.revoked_at_ms IS NULL
      AND link.proof_verified_at_ms<=NEW.accepted_at_ms
      AND link.expires_at_ms>(CAST(strftime('%s','now') AS INTEGER)*1000)
      AND link.proof_verified_at_ms<=
           (CAST(strftime('%s','now') AS INTEGER)*1000)
  ) THEN RAISE(ABORT,'current_identity_link_required') END;
 END;
