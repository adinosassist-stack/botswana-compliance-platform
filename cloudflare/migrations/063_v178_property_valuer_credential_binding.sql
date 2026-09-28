-- V178 / Professional valuer credential binding.
-- Anchors valuation-service assignment and report issuance to the verified professional profile.
-- Thebe records and enforces credential metadata; it does not independently certify the credential.
PRAGMA foreign_keys=ON;

ALTER TABLE professional_profiles ADD COLUMN registration_ref TEXT;
ALTER TABLE professional_profiles ADD COLUMN registration_authority TEXT;
ALTER TABLE professional_profiles ADD COLUMN registration_jurisdiction TEXT;
ALTER TABLE professional_profiles ADD COLUMN registration_valid_until TEXT;
ALTER TABLE professional_profiles ADD COLUMN credential_verified_at TEXT;
ALTER TABLE professional_profiles ADD COLUMN credential_verified_by_user_id TEXT;
ALTER TABLE professional_profiles ADD COLUMN credential_verification_note TEXT;

CREATE TABLE IF NOT EXISTS professional_credential_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional_user_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('CREDENTIAL_RECORDED','CREDENTIAL_VERIFIED','CREDENTIAL_SUSPENDED','CREDENTIAL_UPDATED')),
  registration_ref TEXT,
  registration_authority TEXT,
  registration_jurisdiction TEXT,
  registration_valid_until TEXT,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(professional_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS professional_credential_events_user_idx
  ON professional_credential_events(professional_user_id,occurred_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS professional_verified_registration_uq
  ON professional_profiles(
    lower(trim(registration_jurisdiction)),
    lower(trim(registration_authority)),
    lower(trim(registration_ref))
  )
  WHERE verification_status='verified'
    AND registration_ref IS NOT NULL
    AND registration_authority IS NOT NULL
    AND registration_jurisdiction IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS professional_valuer_verified_credential_guard_insert
BEFORE INSERT ON professional_profiles
WHEN NEW.verification_status='verified'
  AND lower(NEW.professional_type) IN ('property_valuer','valuer','registered_valuer')
BEGIN
  SELECT (CASE WHEN length(trim(coalesce(NEW.registration_ref,'')))<2
    OR length(trim(coalesce(NEW.registration_authority,'')))<2
    OR length(trim(coalesce(NEW.registration_jurisdiction,'')))<2
  THEN RAISE(ABORT,'professional_valuer_credential_required') END);
  SELECT (CASE WHEN NEW.registration_valid_until IS NOT NULL
    AND (length(NEW.registration_valid_until)<>10
      OR date(NEW.registration_valid_until) IS NULL
      OR date(NEW.registration_valid_until)<date('now'))
  THEN RAISE(ABORT,'professional_valuer_credential_expired') END);
  SELECT (CASE WHEN NEW.credential_verified_at IS NULL
  THEN RAISE(ABORT,'professional_valuer_credential_verification_required') END);
END;

CREATE TRIGGER IF NOT EXISTS professional_valuer_verified_credential_guard_update
BEFORE UPDATE OF verification_status,professional_type,registration_ref,registration_authority,registration_jurisdiction,registration_valid_until,credential_verified_at
ON professional_profiles
WHEN NEW.verification_status='verified'
  AND lower(NEW.professional_type) IN ('property_valuer','valuer','registered_valuer')
BEGIN
  SELECT (CASE WHEN length(trim(coalesce(NEW.registration_ref,'')))<2
    OR length(trim(coalesce(NEW.registration_authority,'')))<2
    OR length(trim(coalesce(NEW.registration_jurisdiction,'')))<2
  THEN RAISE(ABORT,'professional_valuer_credential_required') END);
  SELECT (CASE WHEN NEW.registration_valid_until IS NOT NULL
    AND (length(NEW.registration_valid_until)<>10
      OR date(NEW.registration_valid_until) IS NULL
      OR date(NEW.registration_valid_until)<date('now'))
  THEN RAISE(ABORT,'professional_valuer_credential_expired') END);
  SELECT (CASE WHEN NEW.credential_verified_at IS NULL
  THEN RAISE(ABORT,'professional_valuer_credential_verification_required') END);
END;

DROP TRIGGER IF EXISTS property_valuation_service_assignment_credential_guard;
CREATE TRIGGER property_valuation_service_assignment_credential_guard
BEFORE UPDATE OF assigned_professional_user_id,assigned_professional_registration_ref ON property_valuation_service_requests
WHEN NEW.assigned_professional_user_id IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM professional_profiles p
    WHERE p.user_id=NEW.assigned_professional_user_id
      AND p.verification_status='verified'
      AND lower(p.professional_type) IN ('property_valuer','valuer','registered_valuer')
      AND length(trim(coalesce(p.registration_ref,'')))>=2
      AND length(trim(coalesce(p.registration_authority,'')))>=2
      AND length(trim(coalesce(p.registration_jurisdiction,'')))>=2
      AND lower(trim(p.registration_ref))=lower(trim(coalesce(NEW.assigned_professional_registration_ref,'')))
      AND p.credential_verified_at IS NOT NULL
      AND (p.registration_valid_until IS NULL OR date(p.registration_valid_until)>=date('now'))
  ) THEN RAISE(ABORT,'property_valuation_service_professional_credential_mismatch') END);
END;

DROP TRIGGER IF EXISTS property_valuation_service_issued_credential_guard;
CREATE TRIGGER property_valuation_service_issued_credential_guard
BEFORE UPDATE OF status,issued_valuation_id ON property_valuation_service_requests
WHEN NEW.status='report_issued'
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1
    FROM professional_profiles p
    JOIN property_professional_valuations v
      ON v.id=NEW.issued_valuation_id
      AND v.tenant_id=NEW.tenant_id
      AND v.property_id=NEW.property_id
    WHERE p.user_id=NEW.assigned_professional_user_id
      AND p.verification_status='verified'
      AND lower(p.professional_type) IN ('property_valuer','valuer','registered_valuer')
      AND length(trim(coalesce(p.registration_ref,'')))>=2
      AND length(trim(coalesce(p.registration_authority,'')))>=2
      AND length(trim(coalesce(p.registration_jurisdiction,'')))>=2
      AND p.credential_verified_at IS NOT NULL
      AND (p.registration_valid_until IS NULL OR date(p.registration_valid_until)>=date('now'))
      AND lower(trim(p.registration_ref))=lower(trim(coalesce(NEW.assigned_professional_registration_ref,'')))
      AND lower(trim(v.valuer_registration_ref))=lower(trim(p.registration_ref))
  ) THEN RAISE(ABORT,'property_valuation_service_credential_mismatch') END);
END;
