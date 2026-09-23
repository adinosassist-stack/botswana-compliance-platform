-- v115: manual bank-transfer subscription activation for Phase 0
CREATE TABLE IF NOT EXISTS manual_payment_submissions(
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  bank_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewing','approved','rejected','cancelled')),
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by_user_id TEXT,
  rejection_reason TEXT,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS manual_payment_submissions_queue_idx ON manual_payment_submissions(status,submitted_at);
CREATE INDEX IF NOT EXISTS manual_payment_submissions_tenant_idx ON manual_payment_submissions(tenant_id,submitted_at DESC);

CREATE TABLE IF NOT EXISTS manual_payment_events(
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  payment_order_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(submission_id) REFERENCES manual_payment_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS manual_payment_events_submission_idx ON manual_payment_events(submission_id,created_at DESC);
