-- Dedicated shadow telemetry store. Does not alter governed agentic_events or execution policy.
CREATE TABLE IF NOT EXISTS agent_cost_shadow_events (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 run_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 detail_json TEXT NOT NULL,
 occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(run_id) REFERENCES agentic_runs(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS agent_cost_shadow_events_tenant_time ON agent_cost_shadow_events(tenant_id,occurred_at DESC);
