import {billingDashboardRows,billingDashboardAggregate} from './billing-dashboard-reads.js';
import {appendSealedAuditEvent} from './audit-lineage-writer.js';

// Platform-only controls for an existing, verified manual-bank subscription.
export async function subscriptionDashboard(db,{after="",search="",status="all"}={}){
  if(!["all","active","paused","renewal"].includes(status))throw new Error("invalid_subscription_filter");
  const counts=await db.prepare(`SELECT
    SUM(CASE WHEN s.status='active' AND datetime(s.current_period_ends_at)>datetime('now') THEN 1 ELSE 0 END) active,
    SUM(CASE WHEN s.status='paused' THEN 1 ELSE 0 END) paused
    FROM subscriptions s WHERE s.provider='manual_bank'`).first();
  const rows=await db.prepare(`SELECT s.tenant_id,t.name tenant_name,s.plan,s.status,s.current_period_ends_at,
    CASE WHEN datetime(s.current_period_ends_at)>datetime('now') THEN 1 ELSE 0 END current_period
    FROM subscriptions s JOIN tenants t ON t.id=s.tenant_id
    WHERE s.provider='manual_bank' AND s.status IN ('active','paused') AND s.tenant_id>?
    AND (?='' OR instr(lower(t.name),lower(?))>0 OR instr(lower(s.tenant_id),lower(?))>0)
    AND (?='all' OR (?='active' AND s.status='active' AND datetime(s.current_period_ends_at)>datetime('now'))
      OR (?='paused' AND s.status='paused') OR (?='renewal' AND s.status='active' AND datetime(s.current_period_ends_at)>datetime('now') AND datetime(s.current_period_ends_at)<=datetime('now','+7 days')))
    ORDER BY s.tenant_id LIMIT 51`).bind(after,search,search,search,status,status,status,status).all();
  billingDashboardAggregate(counts,['active','paused']);
  const records=billingDashboardRows(rows),items=records.slice(0,50);
  return {items,counts:{active:Number(counts?.active||0),paused:Number(counts?.paused||0)},nextAfter:records.length>50?items.at(-1).tenant_id:null};
}
export async function setSubscriptionAccess({env,auth,body,writeAudit}){
  const {tenantId,enabled,expectedStatus,expectedPeriod}=body;
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(typeof tenantId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId)||typeof enabled!=='boolean'||!['active','paused'].includes(expectedStatus)||typeof expectedPeriod!=='string'||expectedPeriod.length>40||reason.length<5||reason.length>500)return {status:400,body:{error:'invalid_subscription_control'}};
  if(tenantId===auth.tenant_id)return {status:409,body:{error:'cannot_change_current_admin_workspace'}};
  const row=await env.DB.prepare(`SELECT tenant_id,plan,status,provider,current_period_ends_at,
    CASE WHEN datetime(current_period_ends_at)>datetime('now') THEN 1 ELSE 0 END current_period
    FROM subscriptions WHERE tenant_id=?`).bind(tenantId).first();
  if(!row)return {status:404,body:{error:'subscription_not_found'}};
  if(row.provider!=='manual_bank')return {status:409,body:{error:'manual_bank_subscription_required'}};
  if(row.status!==expectedStatus||row.current_period_ends_at!==expectedPeriod)return {status:409,body:{error:'subscription_changed_refresh_required'}};
  const next=enabled?'active':'paused';
  if(row.status===next)return {status:200,body:{ok:true,status:next,unchanged:true}};
  if(enabled&&!Number(row.current_period))return {status:409,body:{error:'paid_period_expired_new_payment_required'}};
  const proof=await env.DB.prepare(`SELECT o.id FROM payment_orders o JOIN payment_fulfillments f ON f.payment_order_id=o.id AND f.tenant_id=o.tenant_id
    WHERE o.tenant_id=? AND o.order_type='subscription' AND o.provider='manual_bank' AND o.status='paid' AND f.fulfillment_status='applied'
    AND json_extract(o.metadata_json,'$.plan')=? LIMIT 1`).bind(tenantId,row.plan).first();
  if(!proof)return {status:409,body:{error:'verified_subscription_payment_required'}};
  // Record intent before changing access: an unavailable audit ledger prevents mutation.
  await writeAudit(env,tenantId,auth.user_id,'SUBSCRIPTION_ACCESS_CHANGE_REQUESTED',{from:row.status,to:next,reason,paymentOrderId:proof.id,periodEndsAt:row.current_period_ends_at});
  const mutation=env.DB.prepare(`UPDATE subscriptions SET status=?,updated_at=CURRENT_TIMESTAMP
    WHERE tenant_id=? AND status=? AND provider='manual_bank' AND current_period_ends_at=? AND plan=?
    AND (?='paused' OR datetime(current_period_ends_at)>datetime('now'))
    AND EXISTS(SELECT 1 FROM payment_orders o JOIN payment_fulfillments f ON f.payment_order_id=o.id AND f.tenant_id=o.tenant_id
      WHERE o.id=? AND o.tenant_id=subscriptions.tenant_id AND o.status='paid' AND f.fulfillment_status='applied')`).bind(next,tenantId,row.status,row.current_period_ends_at,row.plan,next,proof.id);
  const changed=await appendSealedAuditEvent(env,{tenantId,actorUserId:auth.user_id,eventType:'SUBSCRIPTION_ACCESS_CHANGED',entityType:'user',entityId:auth.user_id,
    eventData:{from:row.status,to:next,reason,paymentOrderId:proof.id,periodEndsAt:row.current_period_ends_at},mutation});
  if(!changed.ok)return {status:409,body:{error:'subscription_changed_refresh_required'}};
  return {status:200,body:{ok:true,status:next,periodEndsAt:row.current_period_ends_at}};
}

export async function guardPausedWorkspaceWrites(request,env,{logicalPath,authenticate}){
  if(!logicalPath.startsWith('/api/')||['GET','HEAD','OPTIONS'].includes(request.method))return null;
  if(/^\/api\/(?:auth|account|billing|payments)\//.test(logicalPath)||logicalPath.startsWith('/api/platform/billing/'))return null;
  const auth=await authenticate(request,env);if(!auth)return null;
  const row=await env.DB.prepare('SELECT status FROM subscriptions WHERE tenant_id=? LIMIT 1').bind(auth.tenant_id).first();
  if(row?.status!=='paused')return null;
  return Response.json({error:'subscription_paused',status:'paused',message:'Workspace changes are paused. Read access and billing remain available.'},{status:402,headers:{'cache-control':'no-store'}});
}
