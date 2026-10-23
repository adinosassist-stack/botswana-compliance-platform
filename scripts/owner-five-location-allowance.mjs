import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const OWNER_EMAIL='adinosassist@gmail.com';
const WORKSPACE_NAME='Lovely Group';
const FEATURE='operating_locations';
const REASON='owner_requested_five_locations_20261023';

export async function applyFiveLocationAllowance(query,{apply=false,runId=''}={}){
 const targets=await query(`SELECT t.id tenant_id,u.id user_id FROM tenants t
 JOIN memberships m ON m.tenant_id=t.id JOIN users u ON u.id=m.user_id
 WHERE lower(trim(t.name))=lower(?) AND lower(trim(u.email))=lower(?) AND m.role='owner' AND m.status='active'`,[WORKSPACE_NAME,OWNER_EMAIL]);
 assert.equal(targets.length,1,'Expected exactly one matching active owner workspace; refusing changes');
 const {tenant_id:tenantId,user_id:userId}=targets[0];
 const plan=await query('SELECT e.enabled,e.limit_value FROM subscriptions s JOIN plan_entitlements e ON e.plan=lower(s.plan) WHERE s.tenant_id=? AND e.feature_key=?',[tenantId,FEATURE]);
 assert(plan.length===1&&Number(plan[0].enabled)===1&&plan[0].limit_value!=null&&Number(plan[0].limit_value)>0&&Number(plan[0].limit_value)<=5,'Current plan capacity is missing, disabled or exceeds five; refusing changes');
 const before=await query('SELECT feature_key,enabled,limit_value,expires_at,reason FROM entitlement_overrides WHERE tenant_id=? ORDER BY feature_key',[tenantId]);
 const previous=before.find(x=>x.feature_key===FEATURE);
 assert(!previous||((previous.enabled==null||Number(previous.enabled)===1)&&previous.limit_value!=null&&Number(previous.limit_value)>0&&Number(previous.limit_value)<=5),'Existing override is disabled, unlimited or exceeds five; refusing to replace it');
 const counts=await query('SELECT COUNT(*) count FROM operating_locations WHERE tenant_id=? AND active=1',[tenantId]);
 const active=Number(counts[0]?.count);assert(Number.isSafeInteger(active)&&active>=0&&active<=5,'Active location count invalid or already exceeds five');
 if(!apply)return {mode:'inspect',activeLocations:active,overrideLimit:previous?.limit_value??null,requestedLimit:5};
 assert(/^[0-9]+$/.test(runId),'GitHub run identifier required for apply');
 const audit=async(event,data)=>query(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
 VALUES(?,?,?,'entitlement',?,?)`,[tenantId,userId,event,FEATURE,JSON.stringify({runId,...data})]);
 // Record recovery information before writing. An interrupted intent is never
 // represented as a completed allowance change.
 await audit('OWNER_LOCATION_ALLOWANCE_INTENT',{previous:previous??null,requestedLimit:5});
 const conflict=previous?'DO UPDATE SET enabled=1,limit_value=5,expires_at=NULL,reason=excluded.reason,updated_at=CURRENT_TIMESTAMP WHERE entitlement_overrides.enabled IS ? AND entitlement_overrides.limit_value IS ? AND entitlement_overrides.expires_at IS ? AND entitlement_overrides.reason IS ?':'DO NOTHING';
 const params=[tenantId,FEATURE,REASON,tenantId,userId,OWNER_EMAIL,WORKSPACE_NAME];
 if(previous)params.push(previous.enabled,previous.limit_value,previous.expires_at,previous.reason);
 await query(`INSERT INTO entitlement_overrides(tenant_id,feature_key,enabled,limit_value,expires_at,reason,updated_at)
 SELECT ?,?,1,5,NULL,?,CURRENT_TIMESTAMP WHERE EXISTS (
 SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id
 WHERE m.tenant_id=? AND m.user_id=? AND lower(trim(u.email))=lower(?) AND lower(trim(t.name))=lower(?) AND m.role='owner' AND m.status='active')
 ON CONFLICT(tenant_id,feature_key) ${conflict}`,params);
 const after=await query('SELECT feature_key,enabled,limit_value,expires_at,reason FROM entitlement_overrides WHERE tenant_id=? ORDER BY feature_key',[tenantId]);
 const saved=after.find(x=>x.feature_key===FEATURE);
 assert(saved&&Number(saved.enabled)===1&&Number(saved.limit_value)===5&&saved.expires_at===null&&saved.reason===REASON,'Five-location override not verified; inspect concurrent changes before retrying');
 assert.deepEqual(after.filter(x=>x.feature_key!==FEATURE),before.filter(x=>x.feature_key!==FEATURE),'Unrelated workspace overrides changed during operation');
 await audit('OWNER_LOCATION_ALLOWANCE_VERIFIED',{limit:5,activeLocations:active});
 return {mode:'applied',activeLocations:active,limit:5,verified:true};
}

async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true','Run only through the reviewed GitHub workflow');
 assert.equal(process.env.GITHUB_REPOSITORY,'adinosassist-stack/botswana-compliance-platform');
 assert.equal(process.env.GITHUB_REF,'refs/heads/main');
 assert.equal(process.env.GITHUB_ACTOR,'adinosassist-stack');
 assert.match(process.env.EXPECTED_SHA||'',/^[a-f0-9]{40}$/);
 assert.equal(process.env.EXPECTED_SHA,process.env.GITHUB_SHA);
 const mode=process.env.ALLOWANCE_MODE;assert(['INSPECT_ONLY','APPLY_FIVE_LOCATIONS'].includes(mode),'Invalid allowance mode');
 const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,database=process.env.D1_DATABASE_ID;
 assert(token,'Cloudflare token missing');assert.match(account||'',/^[a-f0-9]{32}$/i);assert.match(database||'',/^[a-f0-9-]{36}$/i);
 const query=async(sql,params=[])=>{
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
  assert(response.ok,`Cloudflare D1 request failed HTTP ${response.status}`);
  const body=await response.json();assert(body.success===true&&Array.isArray(body.result)&&body.result.length===1&&body.result[0].success!==false,'Cloudflare D1 result invalid');
  return body.result[0].results||[];
 };
 console.log('OWNER_LOCATION_ALLOWANCE '+JSON.stringify(await applyFiveLocationAllowance(query,{apply:mode==='APPLY_FIVE_LOCATIONS',runId:process.env.GITHUB_RUN_ID})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Owner location allowance failed. Inspect the workflow stage; no success is claimed.');process.exitCode=1});
