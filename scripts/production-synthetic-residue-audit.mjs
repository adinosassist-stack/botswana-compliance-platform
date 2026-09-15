import fs from 'node:fs';

const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const EMAIL_RE=/^synthetic\.lifecycle\.(\d+)\.(\d+)\.([0-9a-f]{12})@example\.invalid$/;
const COMPANY_RE=/^Thebe Desk Synthetic Lifecycle (\d+)-(\d+)-([0-9a-f]{12})$/;
const EXPECTED_HISTORICAL_COHORT=5;
const QUERY_CONCURRENCY=6;
const BASELINE_DEPENDENCIES=new Set([
  'memberships.tenant_id',
  'sessions.tenant_id',
  'app_state.tenant_id',
  'subscriptions.tenant_id',
  'audit_events.tenant_id',
  'deletion_requests.tenant_id',
  'operating_locations.tenant_id',
  'ai_usage.tenant_id',
  'ai_credit_wallets.tenant_id',
  'ai_credit_ledger.tenant_id',
  'ai_credit_grants.tenant_id',
  'ai_cost_controls.tenant_id',
  'tenant_usage_counters.tenant_id',
  'entitlement_overrides.tenant_id',
  'audit_chain_state.tenant_id',
  'performance_alert_settings.tenant_id'
]);

function fail(message){throw new Error(`Synthetic residue audit failed: ${message}`)}
function assert(condition,message){if(!condition)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function identifier(value,label){const v=String(value||'');assert(/^[A-Za-z0-9_]+$/.test(v),`unsafe ${label} identifier ${safe(v)}`);return v}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');

const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
async function d1(sql,params=[]){
  const response=await fetch(`${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',headers,body:JSON.stringify({sql:String(sql),params})});
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false)fail(`Cloudflare D1 HTTP ${response.status}: ${safe(text)}`);
  const sets=Array.isArray(body?.result)?body.result:[];assert(sets.length&&sets.every(x=>x?.success!==false),`D1 query failed: ${safe(sql)}`);return sets[0];
}
async function rows(sql,params=[]){return (await d1(sql,params)).results||[]}
async function count(sql,params=[]){const row=(await rows(sql,params))[0]||null;const n=Number(row?.count);assert(Number.isFinite(n),`D1 count missing: ${safe(sql)}`);return n}

function parseMarker(email,tenantName){
  const e=EMAIL_RE.exec(String(email||'')),c=COMPANY_RE.exec(String(tenantName||''));
  assert(e&&c,'candidate does not match strict synthetic lifecycle markers');
  assert(e.slice(1).join(':')===c.slice(1).join(':'),'synthetic email/company markers do not correlate exactly');
  return {runId:e[1],attempt:e[2],key:e.slice(1).join(':')};
}

function assertDefaultPerformanceSettings(row){
  assert(row&&typeof row==='object','candidate is missing performance alert settings');
  const expected={
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
  };
  for(const [key,value] of Object.entries(expected)){
    assert(Number(row[key])===value,`candidate performance alert setting ${key} differs from system default`);
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

const candidates=await rows(`SELECT u.id AS user_id,u.email,t.id AS tenant_id,t.name AS tenant_name,m.role,m.status
  FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
  WHERE u.email LIKE 'synthetic.lifecycle.%@example.invalid' AND t.name LIKE 'Thebe Desk Synthetic Lifecycle %'
  ORDER BY u.email`);
assert(candidates.length===0||candidates.length===EXPECTED_HISTORICAL_COHORT,`expected 0 or exactly ${EXPECTED_HISTORICAL_COHORT} strict synthetic candidates, found ${candidates.length}`);
if(!candidates.length){mark('historical synthetic residue','none present');process.exit(0)}

const markers=new Set(),tenantIds=[];
for(const candidate of candidates){
  const marker=parseMarker(candidate.email,candidate.tenant_name);assert(!markers.has(marker.key),'duplicate synthetic run/attempt/nonce marker');markers.add(marker.key);
  assert(candidate.role==='owner'&&candidate.status==='active','candidate is not an active owner membership');
  const [userMemberships,tenantMemberships,subscriptions,evidence,legalHolds,externalIdentities,professionalProfiles,locations,performanceSettings]=await Promise.all([
    count('SELECT COUNT(*) AS count FROM memberships WHERE user_id=?',[candidate.user_id]),
    count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=?',[candidate.tenant_id]),
    count('SELECT COUNT(*) AS count FROM subscriptions WHERE tenant_id=?',[candidate.tenant_id]),
    count('SELECT COUNT(*) AS count FROM evidence WHERE tenant_id=?',[candidate.tenant_id]),
    count("SELECT COUNT(*) AS count FROM legal_holds WHERE tenant_id=? AND status='active' AND active=1",[candidate.tenant_id]),
    count('SELECT COUNT(*) AS count FROM external_identities WHERE user_id=?',[candidate.user_id]),
    count('SELECT COUNT(*) AS count FROM professional_profiles WHERE user_id=?',[candidate.user_id]),
    count('SELECT COUNT(*) AS count FROM operating_locations WHERE tenant_id=?',[candidate.tenant_id]),
    rows(`SELECT enabled,notify_deterioration,notify_improvement,notify_reporting_gap,notify_incidents,notify_in_app,notify_email,notify_whatsapp,coverage_drop_points,metric_drop_percent,improvement_percent,incident_spike_count,recurring_days,min_baseline_days
      FROM performance_alert_settings WHERE tenant_id=?`,[candidate.tenant_id])
  ]);
  assert(userMemberships===1&&tenantMemberships===1,'candidate membership topology is not one user to one tenant');
  assert(subscriptions===1,'candidate does not have exactly one registration-created subscription');
  assert(evidence===0&&legalHolds===0,'candidate contains protected evidence or an active legal hold');
  assert(externalIdentities===0&&professionalProfiles===0,'candidate has external/professional identity data');
  assert(locations<=1,'candidate has more than one operating location');
  assert(performanceSettings.length===1,'candidate does not have exactly one performance alert settings row');
  assertDefaultPerformanceSettings(performanceSettings[0]);
  tenantIds.push(String(candidate.tenant_id));
  mark('synthetic residue marker',`run=${marker.runId} attempt=${marker.attempt}; topology, protected-data and default performance-settings checks passed`);
}

const inventory=dependencyInventory(),selected=inventory.filter(x=>!BASELINE_DEPENDENCIES.has(x.key));
const placeholders=tenantIds.map(()=>'?').join(','),counts=new Array(selected.length);let cursor=0;
async function worker(){for(;;){const i=cursor++;if(i>=selected.length)return;const d=selected[i];counts[i]=await count(`SELECT COUNT(*) AS count FROM ${d.table} WHERE ${d.column} IN (${placeholders})`,tenantIds)}}
await Promise.all(Array.from({length:Math.min(QUERY_CONCURRENCY,selected.length||1)},()=>worker()));
const nonzero=selected.map((d,i)=>({...d,count:counts[i]||0})).filter(x=>x.count>0);
for(const item of nonzero)console.log(`INFO synthetic non-baseline dependency ${item.key}=${item.count}`);
assert(nonzero.length===0,`historical synthetic cohort contains non-baseline tenant dependencies: ${nonzero.slice(0,12).map(x=>`${x.key}=${x.count}`).join(', ')}`);
mark('historical synthetic residue cohort',`exact candidates=${candidates.length}; unique markers=${markers.size}; default performance settings=${candidates.length}; non-baseline dependency columns checked=${selected.length}; unsafe rows=0`);
