// Read-only, aggregate-only SQL plan for independent staging review.
// This module cannot execute SQL, connect to Cloudflare, or mutate any record.
export function legacyVatAggregateInventoryPlan(){
 const rulePredicate="(r.rule_key = 'bw.burs.vat.return-payment.25-days' OR (r.rule_key LIKE 'bw.%vat%' AND CAST(json_extract(r.action_json, '$.dueDaysAfterPeriodEnd') AS INTEGER) = 25))";
 const queries=[
  {name:"rule_status_summary",sql:`SELECT r.status, r.version, r.effective_from, r.effective_to, COUNT(*) AS rule_count FROM regulatory_rules r WHERE ${rulePredicate} GROUP BY r.status,r.version,r.effective_from,r.effective_to ORDER BY r.version,r.status`},
  {name:"obligation_status_period_counts",sql:`SELECT o.status, substr(o.due_at,1,7) AS due_month, COUNT(*) AS obligation_count FROM compliance_obligations o JOIN regulatory_rules r ON r.id=o.rule_id WHERE ${rulePredicate} GROUP BY o.status,substr(o.due_at,1,7) ORDER BY due_month,o.status`},
  {name:"schedule_status_counts",sql:`SELECT s.config_status, COUNT(*) AS schedule_count FROM statutory_schedule_status s JOIN regulatory_rules r ON r.id=s.rule_id WHERE ${rulePredicate} GROUP BY s.config_status ORDER BY s.config_status`}
 ];
 return {scope:"staging-only-review-plan",requiresIndependentReadOnlyApproval:true,executed:false,containsTenantIdentifiers:false,containsWriteStatements:false,queries};
}
