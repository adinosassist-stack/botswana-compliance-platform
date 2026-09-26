-- V132: idempotent per-task Finance observation claims.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS agent_observation_claims (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 persistent_task_id TEXT NOT NULL,
 scheduled_for TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
 attempts INTEGER NOT NULL DEFAULT 1,
 started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 checkpoint_id TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,persistent_task_id,scheduled_for),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(persistent_task_id) REFERENCES agent_persistent_tasks(id) ON DELETE CASCADE,
 FOREIGN KEY(checkpoint_id) REFERENCES agent_observation_checkpoints(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_observation_claims_task_time ON agent_observation_claims(tenant_id,persistent_task_id,scheduled_for DESC);
CREATE TRIGGER IF NOT EXISTS trg_agent_observation_claim_tenant
BEFORE INSERT ON agent_observation_claims
FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM agent_persistent_tasks t WHERE t.id=NEW.persistent_task_id AND t.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'persistent_task_tenant_mismatch'); END;
