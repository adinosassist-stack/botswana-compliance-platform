-- V177 / Property valuation service reliability and credential-bound issuance.
-- Tightens commercial workflow without granting Thebe professional valuation authority.
PRAGMA foreign_keys=ON;

ALTER TABLE property_valuation_service_requests ADD COLUMN quote_issued_at TEXT;
ALTER TABLE property_valuation_service_requests ADD COLUMN assigned_professional_registration_ref TEXT;

CREATE INDEX IF NOT EXISTS property_valuation_service_quote_expiry_idx
  ON property_valuation_service_requests(tenant_id,status,quote_expires_at);

CREATE TRIGGER IF NOT EXISTS property_valuation_service_active_duplicate_guard
BEFORE INSERT ON property_valuation_service_requests
BEGIN
  SELECT (CASE WHEN EXISTS(
    SELECT 1 FROM property_valuation_service_requests r
    WHERE r.tenant_id=NEW.tenant_id
      AND r.property_id=NEW.property_id
      AND r.purpose=NEW.purpose
      AND r.status NOT IN ('report_issued','declined','canceled','refunded')
  ) THEN RAISE(ABORT,'property_valuation_service_duplicate_active') END);
END;

CREATE TRIGGER IF NOT EXISTS property_valuation_service_quote_guard
BEFORE UPDATE OF status,quoted_fee_bwp,quote_expires_at ON property_valuation_service_requests
WHEN NEW.status='awaiting_payment'
BEGIN
  SELECT (CASE WHEN NEW.quoted_fee_bwp IS NULL OR NEW.quoted_fee_bwp<=0
    OR NEW.quote_expires_at IS NULL
    OR datetime(NEW.quote_expires_at) IS NULL
    OR datetime(NEW.quote_expires_at)<=CURRENT_TIMESTAMP
  THEN RAISE(ABORT,'property_valuation_service_quote_invalid') END);
END;

CREATE TRIGGER IF NOT EXISTS property_valuation_service_assignment_credential_guard
BEFORE UPDATE OF assigned_professional_user_id,assigned_professional_registration_ref ON property_valuation_service_requests
WHEN NEW.assigned_professional_user_id IS NOT NULL
BEGIN
  SELECT (CASE WHEN length(trim(coalesce(NEW.assigned_professional_registration_ref,'')))<2
  THEN RAISE(ABORT,'property_valuation_service_registration_required') END);
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM professional_profiles p
    WHERE p.user_id=NEW.assigned_professional_user_id
      AND p.verification_status='verified'
      AND lower(p.professional_type) IN ('property_valuer','valuer','registered_valuer')
  ) THEN RAISE(ABORT,'property_valuation_service_professional_not_verified') END);
END;

CREATE TRIGGER IF NOT EXISTS property_valuation_service_issued_credential_guard
BEFORE UPDATE OF status,issued_valuation_id ON property_valuation_service_requests
WHEN NEW.status='report_issued'
BEGIN
  SELECT (CASE WHEN length(trim(coalesce(NEW.assigned_professional_registration_ref,'')))<2
  THEN RAISE(ABORT,'property_valuation_service_registration_required') END);
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM property_professional_valuations v
    WHERE v.id=NEW.issued_valuation_id
      AND v.tenant_id=NEW.tenant_id
      AND v.property_id=NEW.property_id
      AND lower(trim(v.valuer_registration_ref))=lower(trim(NEW.assigned_professional_registration_ref))
  ) THEN RAISE(ABORT,'property_valuation_service_credential_mismatch') END);
END;
