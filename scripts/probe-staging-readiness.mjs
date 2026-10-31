import {measureReadinessSteps} from './readiness-timing-diagnostics.mjs';

// Explicitly injected D1 binding only: no Cloudflare credentials or production URL.
// Fixed, read-only SQL; return sanitized timings, never query results or D1 errors.
const checks=[
 ['connection','SELECT 1 AS ok'],
 ['agentic_runs','SELECT id FROM agentic_runs LIMIT 1'],
 ['agentic_outcomes','SELECT id FROM agentic_outcomes LIMIT 1'],
 ['business_memory_items','SELECT id FROM business_memory_items LIMIT 1'],
 ['business_memory_events','SELECT id FROM business_memory_events LIMIT 1'],
 ['finance_lineage','SELECT 1 ok FROM finance_lineage LIMIT 1'],
 ['executive_control','SELECT 1 ok FROM executive_control_replacement_governance LIMIT 1'],
 ['auth_rate_limits','SELECT 1 ok FROM auth_rate_limits LIMIT 1'],
 ['deletion_requests','SELECT processing_token,processing_started_at FROM deletion_requests LIMIT 1'],
 ['payment_events','SELECT payment_order_id,processing_token,processing_started_at,processing_attempts FROM payment_events LIMIT 1'],
 ['deletion_tombstones','SELECT 1 ok FROM deletion_tombstones LIMIT 1'],
 ['scheduled_runs','SELECT 1 ok FROM platform_scheduled_runs LIMIT 1'],
 ['api_idempotency','SELECT 1 ok FROM api_idempotency LIMIT 1'],
 ['users','SELECT session_generation FROM users LIMIT 1'],
 ['sessions','SELECT session_generation,public_id FROM sessions LIMIT 1']
];
export async function probeStagingReadiness(db,options={}){
 if(!db||typeof db.prepare!=='function')throw Error('staging_d1_binding_required');
 const steps=checks.map(([name,sql])=>({name,run:async()=>{await db.prepare(sql).first();return true;}}));
 steps.push({name:'revision_trigger',run:async()=>!!await db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='trigger' AND name='daily_employee_reports_revision_snapshot' LIMIT 1").first()});
 steps.push({name:'revision_index',run:async()=>!!await db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='index' AND name='daily_report_revisions_report_revision_uq' LIMIT 1").first()});
 return measureReadinessSteps(steps,options);
}
