-- V81: provider-neutral, read-only Finance connection registry and sync provenance.
-- Provider credentials, access tokens, refresh tokens, passwords, API keys and secrets MUST NOT be stored here.
-- This schema authorizes inbound read-only finance feeds only; it provides no payment, transfer or provider write-back capability.

CREATE TABLE IF NOT EXISTS finance_connections(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  finance_account_id TEXT NOT NULL,
  provider_key TEXT NOT NULL CHECK(provider_key IN ('fnb_bw_business','xero','generic_adapter')),
  connection_type TEXT NOT NULL CHECK(connection_type IN ('bank_feed','accounting_feed','generic_adapter')),
  display_name TEXT NOT NULL,
  external_account_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_configured' CHECK(status IN ('not_configured','active','paused','error','revoked')),
  read_only INTEGER NOT NULL DEFAULT 1 CHECK(read_only=1),
  credential_storage TEXT NOT NULL DEFAULT 'external' CHECK(credential_storage='external'),
  secret_material_stored INTEGER NOT NULL DEFAULT 0 CHECK(secret_material_stored=0),
  last_synced_at TEXT,
  last_sync_status TEXT CHECK(last_sync_status IS NULL OR last_sync_status IN ('completed','no_change','failed','configuration_required')),
  last_error_code TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,finance_account_id,provider_key,external_account_ref),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(finance_account_id) REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_connections_tenant_idx ON finance_connections(tenant_id,status,provider_key,updated_at DESC);
CREATE INDEX IF NOT EXISTS finance_connections_account_idx ON finance_connections(tenant_id,finance_account_id,status);

CREATE TABLE IF NOT EXISTS finance_connection_sync_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  import_batch_id TEXT,
  requested_by_user_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','completed','failed','no_change','configuration_required')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count>=0),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK(imported_count>=0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK(duplicate_count>=0),
  error_code TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(connection_id) REFERENCES finance_connections(id) ON DELETE RESTRICT,
  FOREIGN KEY(import_batch_id) REFERENCES finance_import_batches(id) ON DELETE SET NULL,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_connection_sync_runs_connection_idx ON finance_connection_sync_runs(tenant_id,connection_id,started_at DESC);
CREATE INDEX IF NOT EXISTS finance_connection_sync_runs_status_idx ON finance_connection_sync_runs(tenant_id,status,started_at DESC);
