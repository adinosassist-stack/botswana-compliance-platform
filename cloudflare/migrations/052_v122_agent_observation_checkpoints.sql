CREATE TABLE IF NOT EXISTS agent_observation_checkpoints (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, persistent_task_id TEXT NOT NULL,
 snapshot_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL, exception_json TEXT NOT NULL DEFAULT '[]',
 observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY (persistent_task_id) REFERENCES agent_persistent_tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_observation_checkpoints_task_time ON agent_observation_checkpoints(tenant_id,persistent_task_id,observed_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_agent_observation_checkpoint_tenant
BEFORE INSERT ON agent_observation_checkpoints
FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM agent_persistent_tasks t WHERE t.id=NEW.persistent_task_id AND t.tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT,'persistent_task_tenant_mismatch'); END;