
CREATE TABLE IF NOT EXISTS regulatory_seed_registry(
  pack_key TEXT NOT NULL,
  seed_key TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK(entity_type IN ('source','rule','conflict')),
  entity_id TEXT NOT NULL,
  definition_hash TEXT,
  imported_by_user_id TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(pack_key,seed_key)
);
CREATE INDEX IF NOT EXISTS regulatory_seed_registry_entity_idx
ON regulatory_seed_registry(entity_type,entity_id);

CREATE TABLE IF NOT EXISTS regulatory_pack_imports(
  id TEXT PRIMARY KEY,
  pack_key TEXT NOT NULL,
  pack_version INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  sources_created INTEGER NOT NULL DEFAULT 0,
  rules_created INTEGER NOT NULL DEFAULT 0,
  conflicts_created INTEGER NOT NULL DEFAULT 0,
  sources_existing INTEGER NOT NULL DEFAULT 0,
  rules_existing INTEGER NOT NULL DEFAULT 0,
  conflicts_existing INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','partial','failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS regulatory_pack_imports_pack_idx
ON regulatory_pack_imports(pack_key,created_at DESC);
