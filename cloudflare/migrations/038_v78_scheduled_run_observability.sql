-- V78 v1.21.53: durable scheduled-job observability and replay control.
CREATE TABLE IF NOT EXISTS platform_scheduled_runs(
  id TEXT PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  cron TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_summary TEXT
);
CREATE INDEX IF NOT EXISTS platform_scheduled_runs_cron_time_idx
ON platform_scheduled_runs(cron,scheduled_for DESC);
