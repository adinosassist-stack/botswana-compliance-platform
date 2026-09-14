import crypto from 'node:crypto';
import fs from 'node:fs';

const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const auditSecret=String(process.env.AUDIT_INTEGRITY_SECRET||'');
const BASELINE_OBSERVED_AT=Date.parse('2026-09-14T10:33:32Z');

function fail(message){throw new Error(`Legacy orphan cleanup failed: ${message}`)}
function assert(condition,message){if(!condition)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(auditSecret.length>=32,'AUDIT_INTEGRITY_SECRET is unavailable or too short; refusing destructive production cleanup');

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
async function count(sql,params=[]){const r=await one(sql,params);const n=Number(r?.count);assert(Number.isFinite(n),`D1 count missing: ${safe(sql)}`);return n}
function fingerprint(tenantId){return crypto.createHmac('sha256',auditSecret).update(`tenant-deletion|${tenantId}`).digest('hex')}

const orphanPredicate=`NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=t.id)`;
const orphanRows=await rows(`SELECT t.id,t.created_at FROM tenants t WHERE ${orphanPredicate}`);
if(orphanRows.length===0){
  mark('legacy orphan cleanup','no orphan tenant remains; no mutation required');
  process.exit(0);
}
assert(orphanRows.length===1,`expected exactly one bounded legacy orphan, found ${orphanRows.length}`);

const tenantId=String(orphanRows[0]?.id||'');
const createdAt=Date.parse(String(orphanRows[0]?.created_at||''));
assert(tenantId.length>=8,'legacy orphan tenant id is malformed');
assert(Number.isFinite(createdAt)&&createdAt<=BASELINE_OBSERVED_AT,'orphan tenant is newer than the recorded pre-fix baseline; refusing cleanup');

const beforeTenants=await count('SELECT COUNT(*) AS count FROM tenants');
assert(await count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=?',[tenantId])===0,'orphan unexpectedly has memberships');
assert(await count('SELECT COUNT(*) AS count FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id)')===0,'orphan users exist; refusing tenant-only cleanup');

const subscription=await one('SELECT provider,provider_customer_id,provider_subscription_id FROM subscriptions WHERE tenant_id=?',[tenantId]);
if(subscription){
  assert(!subscription.provider_customer_id&&!subscription.provider_subscription_id,'legacy orphan subscription retains external billing identifiers');
}
assert(await count('SELECT COUNT(*) AS count FROM subscriptions WHERE tenant_id=?',[tenantId])<=1,'legacy orphan has duplicate subscription residue');

const auditEventCount=await count('SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=?',[tenantId]);
assert(auditEventCount===0,'legacy orphan retains backing audit events; refusing cleanup');
const auditChain=await one('SELECT last_event_id,last_hash,event_count FROM audit_chain_state WHERE tenant_id=?',[tenantId]);
if(auditChain){
  const eventCount=Number(auditChain.event_count||0);
  const rawLastEventId=auditChain.last_event_id;
  const lastHash=String(auditChain.last_hash||'');
  assert(Number.isSafeInteger(eventCount)&&eventCount>=0,'legacy orphan audit-chain event_count is invalid');
  if(eventCount===0){
    assert((rawLastEventId===null||rawLastEventId===undefined)&&!lastHash,'zero-count legacy audit-chain metadata is inconsistent');
  }else{
    if(rawLastEventId!==null&&rawLastEventId!==undefined){
      const lastEventId=Number(rawLastEventId);
      assert(Number.isSafeInteger(lastEventId)&&lastEventId>0,'non-null legacy orphan audit-chain last_event_id must be a positive integer');
    }
    assert(/^[0-9a-f]{64}$/i.test(lastHash),'legacy orphan audit-chain last_hash is malformed');
  }
}
assert(await count('SELECT COUNT(*) AS count FROM audit_chain_state WHERE tenant_id=?',[tenantId])<=1,'legacy orphan has duplicate audit-chain residue');

const schema=fs.readFileSync('cloudflare/schema.sql','utf8');
const tableRe=/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\((.*?)\);/gis;
const allowedResidue=new Set(['memberships.tenant_id','subscriptions.tenant_id','audit_chain_state.tenant_id']);
const dependencyChecks=[];
for(const match of schema.matchAll(tableRe)){
  const table=match[1],body=match[2];
  assert(/^[A-Za-z0-9_]+$/.test(table),`unsafe schema table identifier ${safe(table)}`);
  const tenantColumns=[...new Set([...body.matchAll(/\b([A-Za-z0-9_]*tenant_id)\b/gi)].map(x=>x[1]))];
  for(const column of tenantColumns){
    assert(/^[A-Za-z0-9_]+$/.test(column),`unsafe schema tenant column identifier ${safe(column)}`);
    if(allowedResidue.has(`${table}.${column}`))continue;
    dependencyChecks.push([table,column]);
  }
}
assert(dependencyChecks.length>0,'tenant dependency inventory is empty');
let dependencyRows=0;
for(const [table,column] of dependencyChecks){
  dependencyRows+=await count(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column}=?`,[tenantId]);
}
assert(dependencyRows===0,`legacy orphan retains non-baseline tenant-linked rows=${dependencyRows}`);
mark('legacy orphan preflight',`pre-fix age proven; memberships=0 auditEvents=0 businessDependencyRows=0`);

const tenantFingerprint=fingerprint(tenantId);
let tombstone=await one('SELECT request_id,purge_version FROM deletion_tombstones WHERE tenant_fingerprint=?',[tenantFingerprint]);
if(tombstone){
  assert(String(tombstone.purge_version)==='legacy-orphan-v1','existing deletion tombstone belongs to a different purge class');
}else{
  const requestId=`legacy-orphan-${crypto.randomUUID()}`;
  await d1(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged,completed_at)
    VALUES(?,?,'legacy-orphan-v1',0,0,0,CURRENT_TIMESTAMP)`,[requestId,tenantFingerprint]);
  tombstone={request_id:requestId,purge_version:'legacy-orphan-v1'};
}
mark('legacy orphan tombstone','non-PII fingerprint retained before purge');

await d1('DELETE FROM subscriptions WHERE tenant_id=?',[tenantId]);
await d1('DELETE FROM audit_chain_state WHERE tenant_id=?',[tenantId]);
await d1(`DELETE FROM tenants WHERE id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=tenants.id)`,[tenantId]);

assert(await count('SELECT COUNT(*) AS count FROM tenants WHERE id=?',[tenantId])===0,'legacy orphan tenant remains after cleanup');
assert(await count('SELECT COUNT(*) AS count FROM subscriptions WHERE tenant_id=?',[tenantId])===0,'legacy subscription residue remains after cleanup');
assert(await count('SELECT COUNT(*) AS count FROM audit_chain_state WHERE tenant_id=?',[tenantId])===0,'legacy audit-chain residue remains after cleanup');
assert(await count(`SELECT COUNT(*) AS count FROM tenants t WHERE ${orphanPredicate}`)===0,'orphan tenant baseline is not zero after cleanup');
const afterTenants=await count('SELECT COUNT(*) AS count FROM tenants');
assert(afterTenants===beforeTenants-1,'tenant inventory changed by more than the single bounded orphan');
const retained=await one('SELECT purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged FROM deletion_tombstones WHERE tenant_fingerprint=?',[tenantFingerprint]);
assert(retained&&String(retained.purge_version)==='legacy-orphan-v1','legacy orphan tombstone missing after cleanup');
assert(Number(retained.evidence_records_purged)===0&&Number(retained.evidence_objects_purged)===0&&Number(retained.orphan_users_purged)===0,'legacy orphan tombstone purge counts are unexpected');
mark('legacy orphan cleanup','one bounded pre-fix tenant removed; zero-orphan baseline verified; non-PII tombstone retained');
