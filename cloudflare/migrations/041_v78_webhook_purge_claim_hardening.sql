-- V78 1.21.58 — payment-webhook and tenant-purge claim hardening.
-- Adds database-owned processing claims so duplicate deliveries/workers cannot execute
-- the same irreversible workflow concurrently, while allowing bounded stale recovery.

ALTER TABLE payment_events ADD COLUMN payment_order_id TEXT;
ALTER TABLE payment_events ADD COLUMN processing_token TEXT;
ALTER TABLE payment_events ADD COLUMN processing_started_at TEXT;
ALTER TABLE payment_events ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK(processing_attempts BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS payment_events_recovery_idx
  ON payment_events(processed,event_type,processing_started_at,received_at);

ALTER TABLE deletion_requests ADD COLUMN processing_token TEXT;
ALTER TABLE deletion_requests ADD COLUMN processing_started_at TEXT;
CREATE INDEX IF NOT EXISTS deletion_processing_recovery_idx
  ON deletion_requests(status,processing_started_at,requested_at);
