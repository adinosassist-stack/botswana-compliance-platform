-- v114: manual bank-transfer subscription payments with explicit platform-admin verification.
CREATE TABLE IF NOT EXISTS manual_payment_submissions(
  payment_order_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payment_reference TEXT NOT NULL UNIQUE,
  customer_bank_reference TEXT,
  amount_submitted_bwp INTEGER,
  status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK(status IN ('awaiting_payment','submitted','under_review','verified','rejected','canceled')),
  bank_instructions_json TEXT NOT NULL DEFAULT '{}',
  submitted_by_user_id TEXT,
  submitted_at TEXT,
  reviewed_by_user_id TEXT,
  reviewed_by_email TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS manual_payment_submissions_tenant_idx
ON manual_payment_submissions(tenant_id,status,submitted_at DESC);
CREATE INDEX IF NOT EXISTS manual_payment_submissions_review_idx
ON manual_payment_submissions(status,submitted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS manual_payment_verified_bank_reference_unique
ON manual_payment_submissions(customer_bank_reference)
WHERE customer_bank_reference IS NOT NULL AND status='verified';
