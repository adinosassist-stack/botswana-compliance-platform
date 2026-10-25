-- AUTHORISED READ-ONLY INVENTORY. Never run against production without separate access approval.
-- Zero tenant identifiers, individual obligation titles or other PII are returned.
WITH defined AS (
  SELECT r.id,r.rule_key,r.version,r.status,r.effective_from,r.effective_to,
    CASE WHEN json_valid(r.action_json) THEN json_extract(r.action_json,'$.operationalization') END AS operation_type,
    CASE WHEN json_valid(r.action_json) THEN json_extract(r.action_json,'$.dueDaysAfterPeriodEnd') END AS days_after_period
  FROM regulatory_rules r
),
legacy AS (
  SELECT * FROM defined
  WHERE rule_key='bw.burs.vat.return-payment.25-days'
     OR (operation_type='vat_category_period' AND CAST(days_after_period AS INTEGER)=25)
),
obligations AS (
  SELECT rule_id,COUNT(*) AS total_obligations,COUNT(DISTINCT tenant_id) AS affected_tenants,
    SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) AS open_obligations,
    SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress_obligations,
    SUM(CASE WHEN status='review' THEN 1 ELSE 0 END) AS review_obligations,
    SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked_obligations,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_obligations,
    MIN(due_at) AS earliest_due_at,MAX(due_at) AS latest_due_at
  FROM compliance_obligations WHERE rule_id IN (SELECT id FROM legacy)
  GROUP BY rule_id
),
schedules AS (
  SELECT rule_id,COUNT(*) AS schedules,
    SUM(CASE WHEN config_status='ready' THEN 1 ELSE 0 END) AS ready_schedules,
    SUM(CASE WHEN config_status='needs_input' THEN 1 ELSE 0 END) AS needs_input_schedules
  FROM statutory_schedule_status WHERE rule_id IN (SELECT id FROM legacy)
  GROUP BY rule_id
)
SELECT l.rule_key,l.version,l.status AS rule_status,l.effective_from,l.effective_to,
  l.operation_type,l.days_after_period,
  COALESCE(o.total_obligations,0) AS total_obligations,
  COALESCE(o.affected_tenants,0) AS affected_tenants,
  COALESCE(o.open_obligations,0) AS open_obligations,
  COALESCE(o.in_progress_obligations,0) AS in_progress_obligations,
  COALESCE(o.review_obligations,0) AS review_obligations,
  COALESCE(o.blocked_obligations,0) AS blocked_obligations,
  COALESCE(o.completed_obligations,0) AS completed_obligations,
  o.earliest_due_at,o.latest_due_at,
  COALESCE(s.schedules,0) AS schedules,
  COALESCE(s.ready_schedules,0) AS ready_schedules,
  COALESCE(s.needs_input_schedules,0) AS needs_input_schedules
FROM legacy l LEFT JOIN obligations o ON o.rule_id=l.id
LEFT JOIN schedules s ON s.rule_id=l.id
ORDER BY l.rule_key,l.version;
