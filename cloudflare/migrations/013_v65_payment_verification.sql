
CREATE TABLE IF NOT EXISTS payment_verification_attempts(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  trigger_type TEXT NOT NULL
    CHECK(trigger_type IN ('browser_return','webhook','internal_reconcile','scheduled_reconcile','provider_acknowledge')),
  provider_result_code TEXT,
  provider_result_text TEXT,
  provider_amount TEXT,
  provider_currency TEXT,
  provider_reference TEXT,
  fraud_code TEXT,
  verification_status TEXT NOT NULL
    CHECK(verification_status IN ('verified_paid','pending','failed','mismatch','fraud_review','provider_error','not_configured')),
  response_hash TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_verification_attempts_order_idx
ON payment_verification_attempts(payment_order_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS payment_fulfillments(
  payment_order_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_type TEXT NOT NULL,
  fulfillment_status TEXT NOT NULL DEFAULT 'applied'
    CHECK(fulfillment_status IN ('applied','legacy_assumed_applied','reversed','manual_review')),
  fulfillment_json TEXT NOT NULL DEFAULT '{}',
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reversed_at TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_fulfillments_tenant_idx
ON payment_fulfillments(tenant_id,applied_at DESC);

CREATE TABLE IF NOT EXISTS payment_refund_requests(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  amount_bwp INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','processing','succeeded','failed','manual_review')),
  provider_result_code TEXT,
  provider_result_text TEXT,
  reversal_status TEXT,
  requested_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_refund_requests_order_idx
ON payment_refund_requests(payment_order_id,created_at DESC);

-- Prevent old paid orders from being fulfilled a second time after v65.
INSERT OR IGNORE INTO payment_fulfillments(payment_order_id,tenant_id,order_type,fulfillment_status,fulfillment_json,applied_at)
SELECT id,tenant_id,order_type,'legacy_assumed_applied','{"source":"v65_migration"}',COALESCE(paid_at,updated_at,created_at)
FROM payment_orders WHERE status IN ('paid','refunded');


CREATE TABLE IF NOT EXISTS payment_settlement_claims(
  payment_order_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK(status IN ('processing','applied','failed','legacy_assumed_applied')),
  claim_token TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  last_error TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO payment_settlement_claims(payment_order_id,tenant_id,status,claim_token,claimed_at,applied_at)
SELECT id,tenant_id,'legacy_assumed_applied','legacy-v65',COALESCE(paid_at,updated_at,created_at),COALESCE(paid_at,updated_at,created_at)
FROM payment_orders WHERE status IN ('paid','refunded');

CREATE UNIQUE INDEX IF NOT EXISTS payment_refund_active_unique
ON payment_refund_requests(payment_order_id)
WHERE status IN ('processing','succeeded');



CREATE TABLE IF NOT EXISTS payment_integrity_anomalies(
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  payment_order_id TEXT,
  provider TEXT,
  anomaly_type TEXT NOT NULL
    CHECK(anomaly_type IN ('duplicate_provider_token','duplicate_provider_payment_id')),
  provider_reference TEXT,
  resolution TEXT NOT NULL DEFAULT 'quarantined',
  detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS payment_integrity_anomalies_idx
ON payment_integrity_anomalies(anomaly_type,detected_at DESC);

INSERT INTO payment_integrity_anomalies(id,tenant_id,payment_order_id,provider,anomaly_type,provider_reference,resolution)
SELECT lower(hex(randomblob(16))),s.tenant_id,s.payment_order_id,s.provider,'duplicate_provider_token',s.provider_token,'quarantined_token_removed'
FROM payment_provider_sessions s
WHERE s.provider_token IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_provider_sessions x
    WHERE x.provider=s.provider AND x.provider_token=s.provider_token AND x.payment_order_id<s.payment_order_id
  );

UPDATE payment_provider_sessions
SET provider_token=NULL,checkout_url=NULL,provider_status='manual_review_duplicate_token',updated_at=CURRENT_TIMESTAMP
WHERE provider_token IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_provider_sessions x
    WHERE x.provider=payment_provider_sessions.provider
      AND x.provider_token=payment_provider_sessions.provider_token
      AND x.payment_order_id<payment_provider_sessions.payment_order_id
  );

INSERT INTO payment_integrity_anomalies(id,tenant_id,payment_order_id,provider,anomaly_type,provider_reference,resolution)
SELECT lower(hex(randomblob(16))),o.tenant_id,o.id,o.provider,'duplicate_provider_payment_id',o.provider_payment_id,'quarantined_reference_removed'
FROM payment_orders o
WHERE o.provider_payment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_orders x
    WHERE x.provider=o.provider AND x.provider_payment_id=o.provider_payment_id AND x.id<o.id
  );

UPDATE payment_orders
SET provider_payment_id=NULL,updated_at=CURRENT_TIMESTAMP
WHERE provider_payment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM payment_orders x
    WHERE x.provider=payment_orders.provider
      AND x.provider_payment_id=payment_orders.provider_payment_id
      AND x.id<payment_orders.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_session_token_unique
ON payment_provider_sessions(provider,provider_token)
WHERE provider_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payment_order_provider_payment_unique
ON payment_orders(provider,provider_payment_id)
WHERE provider_payment_id IS NOT NULL;


ALTER TABLE payment_provider_sessions ADD COLUMN website_verify_status TEXT;
ALTER TABLE payment_provider_sessions ADD COLUMN website_verified_at TEXT;
