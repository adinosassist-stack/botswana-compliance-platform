import assert from 'node:assert/strict';
import {FOUNDER_AI_FEATURE,founderAiSubject} from '../cloudflare/src/founder-ai-entitlement.js';

// Deliberately has no CLI and is not an application endpoint. A protected,
// independently approved production operation must supply its D1 adapter and
// privately verified identity. No production credentials or identities live here.
export async function setFounderAiEntitlement(db,{tenantId,userId,email,enabled,approvalReference,inspectOnly=true}={}){
  assert(typeof tenantId==='string'&&tenantId.length>0&&typeof userId==='string'&&userId.length>0,'Verified immutable identity required');
  assert(typeof email==='string'&&email.includes('@'),'Verified email required');
  assert(typeof enabled==='boolean','Explicit grant or revoke required');
  const identitySql="SELECT 1 verified FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.user_id=? AND lower(trim(u.email))=lower(trim(?)) AND m.role='owner' AND m.status='active'";
  const identityArgs=[tenantId,userId,email];
  assert(await db.prepare(identitySql).bind(...identityArgs).first(),'Active owner identity does not match');
  const prior=await db.prepare('SELECT enabled,limit_value,expires_at,reason FROM entitlement_overrides WHERE tenant_id=? AND feature_key=?').bind(tenantId,FOUNDER_AI_FEATURE).first();
  const reason=founderAiSubject(userId);
  assert(!prior||(prior.reason===reason&&prior.limit_value===null&&prior.expires_at===null),'Conflicting entitlement requires separate review');
  const desired=Number(enabled);
  if(inspectOnly)return {mode:'inspect',enabled:Number(prior?.enabled)===1,requestedEnabled:enabled};
  assert(typeof approvalReference==='string'&&/^https:\/\/github\.com\/adinosassist-stack\/botswana-compliance-platform\/actions\/runs\/[0-9]+$/.test(approvalReference),'Protected approval run reference required');
  if(prior&&Number(prior.enabled)===desired)return {mode:'unchanged',enabled};
  // D1 batch is transactional: a failed audit rolls back the entitlement write.
  // Compare the prior state so a concurrent revoke/grant is never overwritten.
  const expected=prior?[prior.enabled,prior.reason]:[];
  const mutation=prior
    ?db.prepare(`UPDATE entitlement_overrides SET enabled=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND feature_key=? AND enabled IS ? AND reason=? AND limit_value IS NULL AND expires_at IS NULL AND EXISTS (${identitySql})`).bind(desired,tenantId,FOUNDER_AI_FEATURE,...expected,...identityArgs)
    :db.prepare(`INSERT INTO entitlement_overrides(tenant_id,feature_key,enabled,limit_value,expires_at,reason) SELECT ?,?,?,NULL,NULL,? WHERE EXISTS (${identitySql})`).bind(tenantId,FOUNDER_AI_FEATURE,desired,reason,...identityArgs);
  const event=enabled?'FOUNDER_AI_ENTITLEMENT_GRANTED':'FOUNDER_AI_ENTITLEMENT_REVOKED';
  const audit=db.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
    SELECT ?,?,?,'entitlement',?,? WHERE changes()=1`).bind(tenantId,userId,event,FOUNDER_AI_FEATURE,JSON.stringify({approvalReference,enabled,subjectUserId:userId}));
  const results=await db.batch([mutation,audit]);
  assert(Number(results[0]?.meta?.changes)===1&&Number(results[1]?.meta?.changes)===1,'Concurrent identity or entitlement change; inspect before retry');
  const saved=await db.prepare('SELECT enabled,limit_value,expires_at,reason FROM entitlement_overrides WHERE tenant_id=? AND feature_key=?').bind(tenantId,FOUNDER_AI_FEATURE).first();
  assert(saved&&Number(saved.enabled)===desired&&saved.limit_value===null&&saved.expires_at===null&&saved.reason===reason,'Entitlement verification failed');
  return {mode:'applied',enabled,verified:true};
}
