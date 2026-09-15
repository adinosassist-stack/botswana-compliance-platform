import crypto from 'node:crypto';

const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const auditSecret=String(process.env.AUDIT_INTEGRITY_SECRET||'');
const EMAIL_RE=/^synthetic\.lifecycle\.(\d+)\.(\d+)\.([0-9a-f]{12})@example\.invalid$/;
const COMPANY_RE=/^Thebe Desk Synthetic Lifecycle (\d+)-(\d+)-([0-9a-f]{12})$/;
const MAX_STALE_SYNTHETIC=1;

function fail(message){throw new Error(`Synthetic interruption recovery failed: ${message}`)}
function assert(condition,message){if(!condition)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(auditSecret.length>=32,'AUDIT_INTEGRITY_SECRET is unavailable or too short; refusing synthetic recovery');

const cfHeaders={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};

async function cfJson(path,options={}){
  const response=await fetch(`${CF_API}${path}`,{...options,headers:{...cfHeaders,...(options.headers||{})}});
  const text=await response.text();
  let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(x=>`${x?.code??'unknown'}:${x?.message??'unknown'}`).join(' | '):safe(text);
    fail(`Cloudflare API ${path} HTTP ${response.status}: ${errors}`);
  }
  return body;
}

async function d1(sql,params=[]){
  const body=await cfJson(`/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',body:JSON.stringify({sql:String(sql),params})
  });
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`D1 query failed: ${safe(sql)}`);
  return sets[0];
}
async function rows(sql,params=[]){return (await d1(sql,params)).results||[]}
async function one(sql,params=[]){return (await rows(sql,params))[0]||null}
async function count(sql,params=[]){const row=await one(sql,params);const n=Number(row?.count);assert(Number.isFinite(n),`D1 count missing: ${safe(sql)}`);return n}
function fingerprint(tenantId){return crypto.createHmac('sha256',auditSecret).update(`tenant-deletion|${tenantId}`).digest('hex')}

function parseMarker(email,tenantName){
  const emailMatch=EMAIL_RE.exec(String(email||''));
  const companyMatch=COMPANY_RE.exec(String(tenantName||''));
  assert(emailMatch&&companyMatch,'candidate does not match strict synthetic lifecycle markers');
  const emailMarker=emailMatch.slice(1).join(':');
  const companyMarker=companyMatch.slice(1).join(':');
  assert(emailMarker===companyMarker,'synthetic email/company markers do not correlate exactly');
  return {runId:emailMatch[1],attempt:emailMatch[2],nonce:emailMatch[3]};
}

async function recover(candidate){
  const marker=parseMarker(candidate.email,candidate.tenant_name);
  assert(candidate.role==='owner'&&candidate.status==='active','candidate is not one active owner membership');
  const userId=String(candidate.user_id||'');
  const tenantId=String(candidate.tenant_id||'');
  assert(userId&&tenantId,'candidate identity is incomplete');

  const membershipCount=await count('SELECT COUNT(*) AS count FROM memberships WHERE user_id=?',[userId]);
  const tenantMembershipCount=await count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=?',[tenantId]);
  const evidenceCount=await count('SELECT COUNT(*) AS count FROM evidence WHERE tenant_id=?',[tenantId]);
  const legalHoldCount=await count("SELECT COUNT(*) AS count FROM legal_holds WHERE tenant_id=? AND status='active' AND active=1",[tenantId]);
  assert(membershipCount===1&&tenantMembershipCount===1,'candidate has unexpected membership topology');
  assert(evidenceCount===0,'candidate contains evidence; refusing recovery');
  assert(legalHoldCount===0,'candidate has active legal hold; refusing recovery');

  const existingRequest=await one('SELECT id FROM deletion_requests WHERE tenant_id=? ORDER BY requested_at DESC LIMIT 1',[tenantId]);
  const requestId=existingRequest?.id?String(existingRequest.id):`synthetic-recovery-${crypto.randomUUID()}`;
  const tombstoneFingerprint=fingerprint(tenantId);
  const existingTombstone=await one('SELECT request_id,tenant_fingerprint FROM deletion_tombstones WHERE tenant_fingerprint=?',[tombstoneFingerprint]);
  if(existingTombstone){
    assert(String(existingTombstone.request_id)===requestId,'existing tombstone belongs to a different request');
  }else{
    await d1(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged,completed_at)
      VALUES(?,?,'v2',0,0,1,CURRENT_TIMESTAMP)`,[requestId,tombstoneFingerprint]);
  }

  const nonCascade=[
    ['DELETE FROM audit_events WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM ai_usage WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM payment_return_events WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM payment_integrity_anomalies WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM partner_task_events WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_tasks WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_access_events WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_clients WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_invites WHERE partner_tenant_id=? OR accepted_client_tenant_id=?',[tenantId,tenantId]]
  ];
  for(const [sql,params] of nonCascade)await d1(sql,params);
  await d1('DELETE FROM tenants WHERE id=?',[tenantId]);
  await d1('DELETE FROM users WHERE id=? AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id=?)',[userId,userId]);

  assert(await count('SELECT COUNT(*) AS count FROM users WHERE id=? OR email=?',[userId,candidate.email])===0,'synthetic user remains after recovery');
  assert(await count('SELECT COUNT(*) AS count FROM tenants WHERE id=?',[tenantId])===0,'synthetic tenant remains after recovery');
  assert(await count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=? OR user_id=?',[tenantId,userId])===0,'synthetic membership remains after recovery');
  assert(await count('SELECT COUNT(*) AS count FROM sessions WHERE tenant_id=? OR user_id=?',[tenantId,userId])===0,'synthetic session remains after recovery');
  const tombstone=await one('SELECT request_id,tenant_fingerprint,purge_version FROM deletion_tombstones WHERE request_id=?',[requestId]);
  assert(tombstone&&String(tombstone.tenant_fingerprint)===tombstoneFingerprint&&String(tombstone.purge_version)==='v2','minimal recovery tombstone missing');
  mark('interrupted synthetic recovery',`run=${marker.runId} attempt=${marker.attempt}; tenant/user/session rows removed`);
}

const candidates=await rows(`SELECT u.id AS user_id,u.email,t.id AS tenant_id,t.name AS tenant_name,m.role,m.status
  FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
  WHERE u.email LIKE 'synthetic.lifecycle.%@example.invalid'
    AND t.name LIKE 'Thebe Desk Synthetic Lifecycle %'
  ORDER BY u.email`);
assert(candidates.length<=MAX_STALE_SYNTHETIC,`found ${candidates.length} synthetic candidates; refusing recovery above cap ${MAX_STALE_SYNTHETIC}`);
if(!candidates.length){mark('interrupted synthetic recovery preflight','no stale synthetic lifecycle account found');}
else await recover(candidates[0]);
