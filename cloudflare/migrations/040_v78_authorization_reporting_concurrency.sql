-- V78 v1.21.57 — authorization freshness and daily-report concurrency integrity.
DELETE FROM daily_report_revisions
WHERE id NOT IN (
  SELECT MIN(id) FROM daily_report_revisions GROUP BY report_id,revision_no
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_report_revisions_report_revision_uq
ON daily_report_revisions(report_id,revision_no);

CREATE TRIGGER IF NOT EXISTS daily_employee_reports_revision_snapshot
BEFORE UPDATE OF work_summary,wins,blockers,incidents,next_plan,kpi_json,needs_attention,revision_count ON daily_employee_reports
WHEN NEW.revision_count=OLD.revision_count+1
BEGIN
  INSERT INTO daily_report_revisions(report_id,tenant_id,revision_no,snapshot_json)
  VALUES(OLD.id,OLD.tenant_id,OLD.revision_count,json_object(
    'workSummary',OLD.work_summary,
    'wins',OLD.wins,
    'blockers',OLD.blockers,
    'incidents',OLD.incidents,
    'nextPlan',OLD.next_plan,
    'kpis',json(OLD.kpi_json),
    'needsAttention',OLD.needs_attention,
    'updatedAt',OLD.updated_at
  ));
END;
