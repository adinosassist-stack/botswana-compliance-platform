-- V79 Phase 1: authoritative, provider-neutral Finance & Reconciliation core.
-- Money is stored as integer minor units. Canonical currency is Botswana pula (BWP).
CREATE TABLE IF NOT EXISTS finance_accounts(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('bank','cash','mobile_money','clearing')),
  currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'), opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')), created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,name),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_accounts_tenant_idx ON finance_accounts(tenant_id,status,name);
CREATE TABLE IF NOT EXISTS finance_import_batches(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('manual','csv','adapter')), provider TEXT, idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','completed','failed')), row_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0, duplicate_count INTEGER NOT NULL DEFAULT 0, created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS finance_transactions(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL, import_batch_id TEXT NOT NULL,
  posted_on TEXT NOT NULL, description TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', amount_minor INTEGER NOT NULL CHECK(amount_minor<>0),
  currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'), source_type TEXT NOT NULL CHECK(source_type IN ('manual','csv','adapter')),
  source_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,account_id,source_fingerprint),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY(import_batch_id) REFERENCES finance_import_batches(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS finance_transactions_period_idx ON finance_transactions(tenant_id,account_id,posted_on DESC);
CREATE TABLE IF NOT EXISTS finance_reconciliation_runs(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT NOT NULL, statement_from TEXT NOT NULL, statement_to TEXT NOT NULL,
  opening_balance_minor INTEGER NOT NULL, statement_closing_minor INTEGER NOT NULL, book_closing_minor INTEGER NOT NULL,
  difference_minor INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
  status TEXT NOT NULL CHECK(status IN ('reconciled','exception')), transaction_count INTEGER NOT NULL, snapshot_hash TEXT NOT NULL,
  created_by_user_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_reconciliation_tenant_idx ON finance_reconciliation_runs(tenant_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS finance_lineage(
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL, actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(tenant_id,sequence), UNIQUE(tenant_id,event_hash),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE, FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_lineage_entity_idx ON finance_lineage(tenant_id,entity_type,entity_id,sequence);
