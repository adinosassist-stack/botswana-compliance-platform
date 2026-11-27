CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL CHECK(actor_user_id LIKE 'dock-fixture-%'),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type = 'thebe_live_session'),
  entity_id TEXT,
  event_data TEXT NOT NULL CHECK(json_valid(event_data)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
