
ALTER TABLE partner_tasks ADD COLUMN action_key TEXT;
ALTER TABLE partner_tasks ADD COLUMN source_status TEXT;
ALTER TABLE partner_tasks ADD COLUMN last_seen_at TEXT;
ALTER TABLE partner_tasks ADD COLUMN completed_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS partner_tasks_action_unique
ON partner_tasks(partner_tenant_id,client_tenant_id,action_key)
WHERE action_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS partner_tasks_attention_idx
ON partner_tasks(partner_tenant_id,status,priority,due_at,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS partner_task_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_task_id TEXT NOT NULL,
  partner_tenant_id TEXT NOT NULL,
  client_tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('CREATED','REFRESHED','STATUS_CHANGED','SOURCE_RESOLVED')),
  event_data TEXT NOT NULL DEFAULT '{}',
  actor_user_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(partner_task_id) REFERENCES partner_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_task_events_task_idx
ON partner_task_events(partner_task_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS partner_portfolio_refresh_runs(
  id TEXT PRIMARY KEY,
  partner_tenant_id TEXT NOT NULL,
  clients_scanned INTEGER NOT NULL DEFAULT 0,
  actions_seen INTEGER NOT NULL DEFAULT 0,
  tasks_created INTEGER NOT NULL DEFAULT 0,
  tasks_refreshed INTEGER NOT NULL DEFAULT 0,
  tasks_resolved INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('completed','partial','failed')),
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(partner_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS partner_portfolio_refresh_idx
ON partner_portfolio_refresh_runs(partner_tenant_id,created_at DESC);

INSERT OR IGNORE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','partner_action_center',0,NULL),
 ('business','partner_action_center',0,NULL),
 ('pro','partner_action_center',0,NULL),
 ('partner','partner_action_center',1,NULL);
