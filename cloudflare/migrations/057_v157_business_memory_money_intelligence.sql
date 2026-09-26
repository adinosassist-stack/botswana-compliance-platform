-- V157: durable owner-confirmed business memory for the canonical Thebe context.
-- This schema stores bounded business facts/preferences only. It grants no execution authority.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS business_memory_items(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  namespace TEXT NOT NULL CHECK(namespace IN ('business','finance','sales','operations','language')),
  memory_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK(value_type IN ('text','number','boolean','json')),
  source_kind TEXT NOT NULL DEFAULT 'owner_confirmed' CHECK(source_kind='owner_confirmed'),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK(confidence>=0 AND confidence<=1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_memory_active_key
  ON business_memory_items(tenant_id,namespace,memory_key)
  WHERE status='active';

CREATE INDEX IF NOT EXISTS idx_business_memory_tenant_status
  ON business_memory_items(tenant_id,status,namespace,memory_key);

CREATE TABLE IF NOT EXISTS business_memory_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  memory_item_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('confirmed','superseded','removed')),
  actor_user_id TEXT,
  value_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(memory_item_id) REFERENCES business_memory_items(id) ON DELETE RESTRICT,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_business_memory_events_tenant_created
  ON business_memory_events(tenant_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_business_memory_source_immutable
BEFORE UPDATE OF source_kind,tenant_id,namespace,memory_key,value_type,value_json ON business_memory_items
BEGIN
  SELECT RAISE(ABORT,'business memory facts are immutable; supersede instead');
END;
