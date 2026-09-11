-- v76: consented Meta WhatsApp utility notifications and auditable delivery states.

ALTER TABLE notification_outbox ADD COLUMN dedupe_key TEXT;
ALTER TABLE notification_outbox ADD COLUMN processing_at TEXT;
ALTER TABLE notification_outbox ADD COLUMN provider_status TEXT;
ALTER TABLE notification_outbox ADD COLUMN provider_status_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_external_dedupe_uq
ON notification_outbox(tenant_id,channel,recipient_ref,dedupe_key)
WHERE dedupe_key IS NOT NULL AND recipient_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_outbox_processing_idx
ON notification_outbox(status,processing_at);

CREATE TABLE IF NOT EXISTS whatsapp_consents(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  consent_source TEXT NOT NULL DEFAULT 'account_settings',
  consent_text_version TEXT NOT NULL,
  consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_consents_active_idx
ON whatsapp_consents(tenant_id,status,user_id);

CREATE TABLE IF NOT EXISTS whatsapp_delivery_events(
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','sent','delivered','read','failed')),
  provider_timestamp TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  raw_event_hash TEXT,
  event_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(notification_id) REFERENCES notification_outbox(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_events_message_idx
ON whatsapp_delivery_events(provider_message_id,provider_timestamp);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_events_notification_idx
ON whatsapp_delivery_events(notification_id,provider_timestamp);

ALTER TABLE performance_alert_settings ADD COLUMN notify_whatsapp INTEGER NOT NULL DEFAULT 0;

-- Monthly reservations cap variable messaging exposure by plan. A reservation is
-- consumed when a unique WhatsApp notification is queued, before provider spend.
INSERT OR REPLACE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','whatsapp_notifications',1,20),
 ('business','whatsapp_notifications',1,80),
 ('pro','whatsapp_notifications',1,300),
 ('network','whatsapp_notifications',1,1000),
 ('partner','whatsapp_notifications',1,2000);
