-- Design-stage D1/SQLite schema ONLY. Do not register as a production migration.
-- Retention, deletion and consent policies must be approved before any deployment.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS thebe_conversations_rehearsal (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS thebe_conversation_members_rehearsal (
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(tenant_id,conversation_id,user_id),
  FOREIGN KEY(tenant_id,conversation_id) REFERENCES thebe_conversations_rehearsal(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS thebe_conversation_messages_rehearsal (
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  id TEXT NOT NULL,
  author_user_id TEXT,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('typed','voice_final','assistant')),
  content_redacted TEXT NOT NULL CHECK(length(content_redacted) BETWEEN 1 AND 6000),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,conversation_id,id),
  UNIQUE(tenant_id,conversation_id,idempotency_key),
  FOREIGN KEY(tenant_id,conversation_id) REFERENCES thebe_conversations_rehearsal(tenant_id,id),
  CHECK((role='assistant' AND source_kind='assistant') OR (role='user' AND source_kind IN ('typed','voice_final')))
);
CREATE INDEX IF NOT EXISTS thebe_messages_by_tenant_thread_rehearsal
 ON thebe_conversation_messages_rehearsal(tenant_id,conversation_id,created_at,id);
-- No audio payload columns; partial voice transcript type intentionally excluded.
