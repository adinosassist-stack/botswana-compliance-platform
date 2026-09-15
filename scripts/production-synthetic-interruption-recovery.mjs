import crypto from 'node:crypto';
import fs from 'node:fs';

const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const auditSecret=String(process.env.AUDIT_INTEGRITY_SECRET||'');
const EMAIL_RE=/^synthetic\.lifecycle\.(\d+)\.(\d+)\.([0-9a-f]{12})@example\.invalid$/;
const COMPANY_RE=/^Thebe Desk Synthetic Lifecycle (\d+)-(\d+)-([0-9a-f]{12})$/;
const MAX_SYNTHETIC_COHORT=5;
const QUERY_CONCURRENCY=6;
const EXPECTED_HISTORICAL_RUN_ATTEMPTS=new Set([
  '34972933934:1',
  '34972933934:2',
  '34980328632:1',
  '34995082365:1',
  '34997904456:1'
]);
const BASELINE_DEPENDENCIES=new Set([
  'memberships.tenant_id',
  'sessions.tenant_id',
  'app_state.tenant_id',
  'subscriptions.tenant_id',
  'audit_events.tenant_id',
  'deletion_requests.tenant_id',
  'operating_locations.tenant_id',
  'performance_alert_settings.tenant_id',
  'ai_usage.tenant_id',
  'ai_credit_wallets.tenant_id',
  'ai_credit_ledger.tenant_id',
  'ai_credit_grants.tenant_id',
  'ai_cost_controls.tenant_id',
  'tenant_usage_counters.tenant_id',
  'entitlement_overrides.tenant_id',
  'audit_chain_state.tenant_id'
]);
const DEFAULT_PERFORMANCE_SETTINGS=Object.freeze({
  enabled:1,
  notify_deterioration:1,
  notify_improvement:1,
  notify_reporting_gap:1,
  notify_incidents:1,
  notify_in_app:1,
  notify_email:0,
  notify_whatsapp:0,
  coverage_drop_points:20,
  metric_drop_percent:30,
  improvement_percent:25,
  incident_spike_count:2,
  recurring_days:3,
  min_baseline_days:3
});
const RECOVERY_REASON='Automated production synthetic interruption recovery';

function fail(message){throw new Error(`Synthetic interruption recovery failed: ${message}`)}
function assert(condition,message){if(!condition)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function identifier(value,label){const v=String(value||'');assert(/^[A-Za-z0-9_]+$/.test(v),`unsafe ${label} identifier ${safe(v)}`);return v}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(auditSecret.length>=32,'AUDIT_INTEGRITY_SECRET is unavailable or too short; refusing synthetic recovery');

const cfHeaders={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
async function cfJson(path,options={}){
  const response=await fetch(`${CF_API}${path}`,{...options,headers:{...cfHeaders,...(options.headers||{})}});
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(x=>`${x?.code??'unknown'}:${x?.message??'unknown'}`).join(' | '):safe(text);
    fail(`Cloudflare API ${path} HTTP ${response.status}: ${errors}`);
  }
  return body;
}
async function d1(sql,params=[]){
  const body=await cfJson(`/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',body:JSON.stringify({sql:String(sql),params})});
  const sets=Array.isArray(body?.result)?body.result:[];assert(sets.length&&sets.every(x=>x?.success!==false),`D1 query failed: ${safe(sql)}`);return sets[0];
}
async function rows(sql,params=[]){return (await d1(sql,params)).results||[]}
async function one(sql,params=[]){return (await rows(sql,params))[0]||null}
async function count(sql,params=[]){const row=await one(sql,params);const n=Number(row?.count);assert(Number.isFinite(n),`D1 count missing: ${safe(sql)}`);return n}
function fingerprint(tenantId){return crypto.createHmac('sha256',auditSecret).update(`tenant-deletion|${tenantId}`).digest('hex')}
function recoveryRequestId(tenantId){return `synthetic-recovery-${fingerprint(tenantId).slice(0,32)}`}

function parseMarker(email,tenantName){
  const e=EMAIL_RE.exec(String(email||'')),c=COMPANY_RE.exec(String(tenantName||''));
  assert(e&&c,'candidate does not match strict synthetic lifecycle markers');
  assert(e.slice(1).join(':')===c.slice(1).join(':'),'synthetic email/company markers do not correlate exactly');
  return {runId:e[1],attempt:e[2],nonce:e[3],runAttempt:`${e[1]}:${e[2]}`,key:e.slice(1).join(':')};
}
function assertDefaultPerformanceSettings(row){
  assert(row&&typeof row==='object','candidate is missing system-created performance alert settings');
  for(const [key,expected] of Object.entries(DEFAULT_PERFORMANCE_SETTINGS)){
    assert(Number(row[key])===expected,`candidate performance alert setting ${key} differs from system default`);
  }
}
function dependencyInventory(){
  const schema=fs.readFileSync('cloudflare/schema.sql','utf8');
  const tableRe=/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\((.*?)\);/gis;const out=[];
  for(const match of schema.matchAll(tableRe)){
    const table=identifier(match[1],'table');if(table==='tenants')continue;
    const columns=[...new Set([...match[2].matchAll(/\b([A-Za-z0-9_]*tenant_id)\b/gi)].map(x=>identifier(x[1],'tenant column')))];
    for(const column of columns)out.push({table,column,key:`${table}.${column}`});
  }
  assert(out.length>0,'tenant dependency inventory is empty');return out;
}

async function existingDeletionRequest(candidate){
  const requestRows=await rows('SELECT id,status,tenant_id,user_id,requested_by_user_id FROM deletion_requests WHERE tenant_id=? ORDER BY requested_at DESC',[candidate.tenantId]);
  assert(requestRows.length<=1,'candidate has multiple deletion requests; refusing recovery');
  if(!requestRows.length)return null;
  const request=requestRows[0];
  assert(String(request.tenant_id)===candidate.tenantId&&String(request.user_id)===candidate.userId,'existing deletion request identity mismatch');
  assert(['requested','approved','processing'].includes(String(request.status)),'existing deletion request is not in a recoverable state');
  return request;
}
async function existingPreparedTombstone(candidate){
  const tombstoneFingerprint=fingerprint(candidate.tenantId);
  const tombstone=await one('SELECT request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged FROM deletion_tombstones WHERE tenant_fingerprint=?',[tombstoneFingerprint]);
  if(!tombstone)return null;
  assert(String(tombstone.tenant_fingerprint)===tombstoneFingerprint,'prepared tombstone fingerprint mismatch');
  assert(String(tombstone.purge_version)==='v2','prepared tombstone purge version mismatch');
  assert(Number(tombstone.evidence_records_purged)===0&&Number(tombstone.evidence_objects_purged)===0,'prepared tombstone has unexpected evidence purge counts');
  assert(Number(tombstone.orphan_users_purged)===1,'prepared tombstone orphan-user count mismatch');
  const request=await existingDeletionRequest(candidate);
  assert(request&&String(request.id)===String(tombstone.request_id),'prepared tombstone has no matching recoverable deletion request');
  return tombstone;
}

async function preflightCandidate(raw){
  const marker=parseMarker(raw.email,raw.tenant_name);
  assert(raw.role==='owner'&&raw.status==='active','candidate is not one active owner membership');
  const userId=String(raw.user_id||''),tenantId=String(raw.tenant_id||'');assert(userId&&tenantId,'candidate identity is incomplete');
  const candidate={...raw,userId,tenantId,marker};
  const [membershipCount,tenantMembershipCount,subscriptionCount,evidenceCount,legalHoldCount,externalIdentityCount,professionalProfileCount,locationCount,performanceSettings]=await Promise.all([
    count('SELECT COUNT(*) AS count FROM memberships WHERE user_id=?',[userId]),
    count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=?',[tenantId]),
    count('SELECT COUNT(*) AS count FROM subscriptions WHERE tenant_id=?',[tenantId]),
    count('SELECT COUNT(*) AS count FROM evidence WHERE tenant_id=?',[tenantId]),
    count("SELECT COUNT(*) AS count FROM legal_holds WHERE tenant_id=? AND status='active' AND active=1",[tenantId]),
    count('SELECT COUNT(*) AS count FROM external_identities WHERE user_id=?',[userId]),
    count('SELECT COUNT(*) AS count FROM professional_profiles WHERE user_id=?',[userId]),
    count('SELECT COUNT(*) AS count FROM operating_locations WHERE tenant_id=?',[tenantId]),
    rows('SELECT enabled,notify_deterioration,notify_improvement,notify_reporting_gap,notify_incidents,notify_in_app,notify_email,notify_whatsapp,coverage_drop_points,metric_drop_percent,improvement_percent,incident_spike_count,recurring_days,min_baseline_days FROM performance_alert_settings WHERE tenant_id=?',[tenantId])
  ]);
  assert(membershipCount===1&&tenantMembershipCount===1,'candidate has unexpected membership topology');
  assert(subscriptionCount===1,'candidate does not have exactly one registration-created subscription');
  assert(evidenceCount===0&&legalHoldCount===0,'candidate contains protected evidence or an active legal hold');
  assert(externalIdentityCount===0&&professionalProfileCount===0,'candidate has external/professional identity data');
  assert(locationCount<=1,'candidate has more than one operating location');
  assert(performanceSettings.length===1,'candidate does not have exactly one system-created performance alert settings row');
  assertDefaultPerformanceSettings(performanceSettings[0]);
  candidate.request=await existingDeletionRequest(candidate);
  candidate.tombstone=await existingPreparedTombstone(candidate);
  mark('synthetic recovery candidate preflight',`run=${marker.runId} attempt=${marker.attempt}; protected/default checks passed`);
  return candidate;
}

async function assertCohortDependencies(candidates){
  const tenantIds=candidates.map(x=>x.tenantId),inventory=dependencyInventory(),selected=inventory.filter(x=>!BASELINE_DEPENDENCIES.has(x.key));
  const placeholders=tenantIds.map(()=>'?').join(','),counts=new Array(selected.length);let cursor=0;
  async function worker(){for(;;){const i=cursor++;if(i>=selected.length)return;const d=selected[i];counts[i]=await count(`SELECT COUNT(*) AS count FROM ${d.table} WHERE ${d.column} IN (${placeholders})`,tenantIds)}}
  await Promise.all(Array.from({length:Math.min(QUERY_CONCURRENCY,selected.length||1)},()=>worker()));
  const nonzero=selected.map((d,i)=>({...d,count:counts[i]||0})).filter(x=>x.count>0);
  for(const item of nonzero)console.log(`INFO synthetic recovery non-baseline dependency ${item.key}=${item.count}`);
  assert(nonzero.length===0,`synthetic recovery cohort contains non-baseline tenant dependencies: ${nonzero.slice(0,12).map(x=>`${x.key}=${x.count}`).join(', ')}`);
  mark('synthetic recovery cohort dependency preflight',`candidates=${candidates.length}; columns=${selected.length}; unsafe rows=0`);
}

function assertCohortAuthorization(candidates){
  const n=candidates.length,prepared=candidates.filter(x=>x.tombstone);
  if(n===MAX_SYNTHETIC_COHORT){
    const runAttempts=new Set(candidates.map(x=>x.marker.runAttempt));
    assert(runAttempts.size===EXPECTED_HISTORICAL_RUN_ATTEMPTS.size&&[...EXPECTED_HISTORICAL_RUN_ATTEMPTS].every(x=>runAttempts.has(x)),'five-account recovery is not the exact proven historical run/attempt cohort');
    assert(prepared.length===0||prepared.length===n,'five-account recovery has mixed prepared/unprepared tombstone state');
    return {mode:prepared.length===n?'resume_historical':'prepare_historical'};
  }
  if(n>=2&&n<MAX_SYNTHETIC_COHORT){
    assert(candidates.every(x=>EXPECTED_HISTORICAL_RUN_ATTEMPTS.has(x.marker.runAttempt)),'partial cohort contains a non-historical synthetic marker');
    assert(prepared.length===n,'partial historical cohort may resume only when every remaining candidate has a valid preexisting tombstone');
    return {mode:'resume_partial_historical'};
  }
  assert(n===1,'unexpected synthetic cohort size');
  return {mode:prepared.length===1?'resume_single':'prepare_single'};
}

async function prepareCandidate(candidate){
  const tombstoneFingerprint=fingerprint(candidate.tenantId);
  let request=candidate.request;
  if(!request){
    const requestId=recoveryRequestId(candidate.tenantId);
    await d1(`INSERT INTO deletion_requests(id,tenant_id,user_id,requested_by_user_id,status,reason,attempts,processing_token,processing_started_at)
      VALUES(?,?,?,?,? ,?,1,?,CURRENT_TIMESTAMP)`,[requestId,candidate.tenantId,candidate.userId,candidate.userId,'processing',RECOVERY_REASON,`synthetic-cohort-${tombstoneFingerprint.slice(0,24)}`]);
    request=await existingDeletionRequest(candidate);
  }else{
    await d1(`UPDATE deletion_requests SET status='processing',reason=COALESCE(reason,?),attempts=attempts+1,last_error=NULL,processing_token=?,processing_started_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND user_id=? AND status IN ('requested','approved','processing')`,[RECOVERY_REASON,`synthetic-cohort-${tombstoneFingerprint.slice(0,24)}`,request.id,candidate.tenantId,candidate.userId]);
    request=await existingDeletionRequest(candidate);
  }
  assert(request&&String(request.status)==='processing','candidate deletion request did not enter processing state');
  const collisions=await rows('SELECT request_id,tenant_fingerprint FROM deletion_tombstones WHERE request_id=? OR tenant_fingerprint=?',[String(request.id),tombstoneFingerprint]);
  assert(collisions.length===0,'candidate tombstone collides with an existing deletion proof');
  await d1(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged,completed_at)
    VALUES(?,?,'v2',0,0,1,CURRENT_TIMESTAMP)`,[String(request.id),tombstoneFingerprint]);
  candidate.request=request;
  candidate.tombstone=await existingPreparedTombstone(candidate);
  assert(candidate.tombstone,'candidate tombstone preparation did not persist');
  mark('synthetic recovery preparation',`run=${candidate.marker.runId} attempt=${candidate.marker.attempt}; request+tombstone prepared`);
}

async function assertStillPrepared(candidate){
  const current=await one(`SELECT u.id AS user_id,u.email,t.id AS tenant_id,t.name AS tenant_name,m.role,m.status
    FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
    WHERE u.id=? AND t.id=? LIMIT 1`,[candidate.userId,candidate.tenantId]);
  assert(current,'prepared synthetic candidate disappeared before deletion');
  const marker=parseMarker(current.email,current.tenant_name);
  assert(marker.key===candidate.marker.key&&current.role==='owner'&&current.status==='active','prepared synthetic candidate identity changed before deletion');
  const tombstone=await existingPreparedTombstone(candidate);assert(tombstone,'prepared synthetic tombstone disappeared before deletion');
}

async function purgeCandidate(candidate){
  await assertStillPrepared(candidate);
  const nonCascade=[
    ['DELETE FROM audit_events WHERE tenant_id=?',[candidate.tenantId]],
    ['DELETE FROM ai_usage WHERE tenant_id=?',[candidate.tenantId]],
    ['DELETE FROM payment_return_events WHERE tenant_id=?',[candidate.tenantId]],
    ['DELETE FROM payment_integrity_anomalies WHERE tenant_id=?',[candidate.tenantId]],
    ['DELETE FROM partner_task_events WHERE partner_tenant_id=? OR client_tenant_id=?',[candidate.tenantId,candidate.tenantId]],
    ['DELETE FROM partner_tasks WHERE partner_tenant_id=? OR client_tenant_id=?',[candidate.tenantId,candidate.tenantId]],
    ['DELETE FROM partner_access_events WHERE partner_tenant_id=? OR client_tenant_id=?',[candidate.tenantId,candidate.tenantId]],
    ['DELETE FROM partner_clients WHERE partner_tenant_id=? OR client_tenant_id=?',[candidate.tenantId,candidate.tenantId]],
    ['DELETE FROM partner_invites WHERE partner_tenant_id=? OR accepted_client_tenant_id=?',[candidate.tenantId,candidate.tenantId]]
  ];
  for(const [sql,params] of nonCascade)await d1(sql,params);
  await d1('DELETE FROM tenants WHERE id=?',[candidate.tenantId]);
  await d1('DELETE FROM users WHERE id=? AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id=?)',[candidate.userId,candidate.userId]);
  assert(await count('SELECT COUNT(*) AS count FROM users WHERE id=? OR email=?',[candidate.userId,candidate.email])===0,'synthetic user remains after recovery');
  assert(await count('SELECT COUNT(*) AS count FROM tenants WHERE id=?',[candidate.tenantId])===0,'synthetic tenant remains after recovery');
  assert(await count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=? OR user_id=?',[candidate.tenantId,candidate.userId])===0,'synthetic membership remains after recovery');
  assert(await count('SELECT COUNT(*) AS count FROM sessions WHERE tenant_id=? OR user_id=?',[candidate.tenantId,candidate.userId])===0,'synthetic session remains after recovery');
  const tombstone=await one('SELECT request_id,tenant_fingerprint,purge_version FROM deletion_tombstones WHERE request_id=?',[String(candidate.request.id)]);
  assert(tombstone&&String(tombstone.tenant_fingerprint)===fingerprint(candidate.tenantId)&&String(tombstone.purge_version)==='v2','minimal recovery tombstone missing');
  mark('interrupted synthetic recovery',`run=${candidate.marker.runId} attempt=${candidate.marker.attempt}; tenant/user/session rows removed`);
}

const rawCandidates=await rows(`SELECT u.id AS user_id,u.email,t.id AS tenant_id,t.name AS tenant_name,m.role,m.status
  FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
  WHERE u.email LIKE 'synthetic.lifecycle.%@example.invalid' AND t.name LIKE 'Thebe Desk Synthetic Lifecycle %'
  ORDER BY u.email`);
assert(rawCandidates.length<=MAX_SYNTHETIC_COHORT,`found ${rawCandidates.length} synthetic candidates; refusing recovery above cap ${MAX_SYNTHETIC_COHORT}`);
if(!rawCandidates.length){mark('interrupted synthetic recovery preflight','no stale synthetic lifecycle account found');console.log('SYNTHETIC_INTERRUPTION_RECOVERY_PASS');process.exit(0)}

const candidates=[];for(const raw of rawCandidates)candidates.push(await preflightCandidate(raw));
assert(new Set(candidates.map(x=>x.marker.key)).size===candidates.length,'duplicate synthetic run/attempt/nonce marker');
await assertCohortDependencies(candidates);
const authorization=assertCohortAuthorization(candidates);
mark('synthetic recovery cohort authorization',`${authorization.mode}; candidates=${candidates.length}`);

if(authorization.mode==='prepare_historical'||authorization.mode==='prepare_single'){
  for(const candidate of candidates)await prepareCandidate(candidate);
  assert(candidates.every(x=>x.tombstone),'not every candidate has a prepared tombstone');
  mark('synthetic recovery cohort preparation','all candidate tombstones prepared before first destructive deletion');
}

for(const candidate of candidates)await assertStillPrepared(candidate);
for(const candidate of candidates)await purgeCandidate(candidate);

const leftovers=await count(`SELECT COUNT(*) AS count FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
  WHERE u.email LIKE 'synthetic.lifecycle.%@example.invalid' AND t.name LIKE 'Thebe Desk Synthetic Lifecycle %'`);
const orphanUsers=await count('SELECT COUNT(*) AS count FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id)');
assert(leftovers===0,'strict synthetic lifecycle residue remains after recovery');
assert(orphanUsers===0,'orphan users remain after synthetic interruption recovery');
mark('synthetic interruption recovery closure',`removed=${candidates.length}; strict residue=0; orphan users=0`);
console.log('SYNTHETIC_INTERRUPTION_RECOVERY_PASS');
