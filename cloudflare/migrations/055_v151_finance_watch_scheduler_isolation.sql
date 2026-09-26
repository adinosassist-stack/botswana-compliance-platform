-- V151: Finance Watch scheduler isolation and global due-task access path.
PRAGMA foreign_keys=ON;

CREATE INDEX IF NOT EXISTS agent_persistent_tasks_scheduler_due
ON agent_persistent_tasks(next_run_at,id)
WHERE status='active' AND trigger_kind='scheduled' AND next_run_at IS NOT NULL;
