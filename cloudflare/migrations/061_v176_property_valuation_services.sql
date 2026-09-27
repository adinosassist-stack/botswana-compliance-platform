-- V176 / Quote-based professional property valuation service workflow.
-- Adds commercial case management without granting Thebe professional valuation authority.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS property_valuation_service_requests(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  requested_by_user_id TEXT,
  purpose TEXT NOT NULL CHECK(purpose IN ('finance','sale','purchase','insurance','financial_reporting','estate','legal','tax','internal','other')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN (
    'requested','quoted','awaiting_payment','paid','assigned','inspection_scheduled',
    'fieldwork_complete','drafting','professional_review','report_issued','declined','canceled','refunded'
  )),
  desired_by_date TEXT,
  access_contact_name TEXT,
  access_contact_phone TEXT,
  client_notes TEXT,
  quoted_fee_bwp INTEGER CHECK(quoted_fee_bwp IS NULL OR quoted_fee_bwp>0),
  quote_expires_at TEXT,
  service_order_id TEXT,
  assigned_professional_user_id TEXT,
  inspection_scheduled_at TEXT,
  issued_valuation_id TEXT,
  issued_report_evidence_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  canceled_at TEXT,
  CHECK(desired_by_date IS NULL OR length(desired_by_date)=10),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(property_id) REFERENCES property_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(service_order_id) REFERENCES service_orders(id) ON DELETE SET NULL,
  FOREIGN KEY(assigned_professional_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(issued_valuation_id) REFERENCES property_professional_valuations(id) ON DELETE SET NULL,
  FOREIGN KEY(issued_report_evidence_id) REFERENCES evidence(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS property_valuation_service_tenant_idx
  ON property_valuation_service_requests(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS property_valuation_service_property_idx
  ON property_valuation_service_requests(tenant_id,property_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS property_valuation_service_order_uq
  ON property_valuation_service_requests(service_order_id) WHERE service_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS property_valuation_service_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES property_valuation_service_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS property_valuation_service_events_idx
  ON property_valuation_service_events(request_id,occurred_at DESC);

CREATE TRIGGER IF NOT EXISTS property_valuation_service_property_guard
BEFORE INSERT ON property_valuation_service_requests
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM property_assets a
    WHERE a.id=NEW.property_id AND a.tenant_id=NEW.tenant_id AND a.status='active'
  ) THEN RAISE(ABORT,'property_valuation_service_asset_mismatch') END);
END;

CREATE TRIGGER IF NOT EXISTS property_valuation_service_professional_guard
BEFORE UPDATE OF assigned_professional_user_id ON property_valuation_service_requests
WHEN NEW.assigned_professional_user_id IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM professional_profiles p
    WHERE p.user_id=NEW.assigned_professional_user_id
      AND p.verification_status='verified'
      AND lower(p.professional_type) IN ('property_valuer','valuer','registered_valuer')
  ) THEN RAISE(ABORT,'property_valuation_service_professional_not_verified') END);
END;

CREATE TRIGGER IF NOT EXISTS property_valuation_service_issued_guard
BEFORE UPDATE OF status,issued_valuation_id,issued_report_evidence_id ON property_valuation_service_requests
WHEN NEW.status='report_issued'
BEGIN
  SELECT (CASE WHEN NEW.assigned_professional_user_id IS NULL
    OR NEW.issued_valuation_id IS NULL
    OR NEW.issued_report_evidence_id IS NULL
  THEN RAISE(ABORT,'property_valuation_service_issuance_incomplete') END);
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1
    FROM property_professional_valuations v
    JOIN property_valuation_evidence_links l
      ON l.tenant_id=v.tenant_id AND l.property_id=v.property_id AND l.valuation_id=v.id
      AND l.evidence_id=NEW.issued_report_evidence_id AND l.link_kind='signed_report'
    WHERE v.id=NEW.issued_valuation_id
      AND v.tenant_id=NEW.tenant_id
      AND v.property_id=NEW.property_id
  ) THEN RAISE(ABORT,'property_valuation_service_report_not_linked') END);
END;
