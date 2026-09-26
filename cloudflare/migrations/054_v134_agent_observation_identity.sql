-- V134: deterministic Finance observation identity and checkpoint deduplication.
PRAGMA foreign_keys=ON;
ALTER TABLE agent_observation_checkpoints ADD COLUMN scheduled_for TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_observation_checkpoint_occurrence
ON agent_observation_checkpoints(tenant_id,persistent_task_id,scheduled_for)
WHERE scheduled_for IS NOT NULL;
