const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const scriptName=String(process.env.CF_WORKER_SCRIPT_NAME||'bw-compliance-os').trim();

function fail(message){throw new Error(`Regulatory reviewer readiness diagnostic failed: ${message}`)}
function assert(value,message){if(!value)fail(message)}
function parseEmails(value){
  const values=[...new Set(String(value||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean))];
  assert(values.length>0,'reviewer allowlist is empty');
  assert(values.every(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)),'reviewer allowlist contains an invalid email');
  return values;
}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0}

assert(String(process.env.GITHUB_ACTIONS||'')==='true','refusing to run outside GitHub Actions');
assert(token.length>=20,'CLOUDFLARE_API_TOKEN is unavailable or too short');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(scriptName==='bw-compliance-os','unexpected Worker script name');

const headers={authorization:`Bearer ${token}`,accept:'application/json'};
async function query(sql,params=[]){
  const trimmed=String(sql||'').trim();
  assert(/^SELECT\b/i.test(trimmed),'diagnostic permits SELECT statements only');
  assert(!/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|VACUUM|PRAGMA|ATTACH|DETACH)\b/i.test(trimmed),'diagnostic SQL contains a forbidden mutation keyword');
  const response=await fetch(`${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',
    headers:{...headers,'content-type':'application/json'},
    body:JSON.stringify({sql:trimmed,params}),
    signal:AbortSignal.timeout(20000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.success===false) fail(`Cloudflare D1 query HTTP ${response.status}`);
  const result=Array.isArray(body?.result)?body.result[0]:null;
  assert(result?.success!==false,'D1 query result was unsuccessful');
  return Array.isArray(result?.results)?result.results:[];
}

async function liveWorkerAllowlist(){
  const response=await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}/settings`,{
    method:'GET',headers,signal:AbortSignal.timeout(20000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.success===false) fail(`Worker settings lookup HTTP ${response.status}`);
  const binding=(body?.result?.bindings||[]).find(item=>item?.name==='PLATFORM_REGULATORY_REVIEWERS'&&item?.type==='plain_text');
  assert(binding&&typeof binding.text==='string','live Worker reviewer allowlist binding is missing');
  return parseEmails(binding.text);
}

function makerCheckerReady(rows){
  const active=rows.filter(row=>number(row.active)===1);
  const editors=active.filter(row=>row.role==='editor'||row.role==='admin');
  const reviewers=active.filter(row=>row.role==='reviewer'||row.role==='admin');
  return editors.some(editor=>reviewers.some(reviewer=>String(editor.user_id)!==String(reviewer.user_id)));
}

const live=await liveWorkerAllowlist();
const principals=await query(`SELECT user_id,email,role,active FROM platform_regulatory_principals ORDER BY user_id`);
const activePrincipals=principals.filter(row=>number(row.active)===1);
const activeEditorIds=new Set(activePrincipals.filter(row=>row.role==='editor'||row.role==='admin').map(row=>String(row.user_id)));
const existingReady=makerCheckerReady(principals);

const placeholders=live.map(()=>'?').join(',');
const users=await query(`SELECT u.id, COUNT(m.user_id) AS membership_count FROM users u LEFT JOIN memberships m ON m.user_id=u.id WHERE lower(u.email) IN (${placeholders}) GROUP BY u.id ORDER BY u.id`,live);
const principalByUser=new Map(principals.map(row=>[String(row.user_id),row]));
const exclusion={activeEditor:0,incompatiblePrincipal:0,noMembership:0};
const eligible=[];
for(const user of users){
  const id=String(user.id);
  if(activeEditorIds.has(id)){
    exclusion.activeEditor+=1;
    continue;
  }
  const principal=principalByUser.get(id);
  if(principal&&(principal.role!=='reviewer'||number(principal.active)!==0)){
    exclusion.incompatiblePrincipal+=1;
    continue;
  }
  if(number(user.membership_count)<=0){
    exclusion.noMembership+=1;
    continue;
  }
  eligible.push(user);
}

console.log('READ_ONLY_REGULATORY_REVIEWER_READINESS');
console.log(`liveReviewerAllowlistCount=${live.length}`);
console.log(`activeRegulatoryPrincipals=${activePrincipals.length}`);
console.log(`activeEditorCapable=${activePrincipals.filter(row=>row.role==='editor'||row.role==='admin').length}`);
console.log(`activeReviewerCapable=${activePrincipals.filter(row=>row.role==='reviewer'||row.role==='admin').length}`);
console.log(`makerCheckerReady=${existingReady}`);
console.log(`allowlistedExistingUsers=${users.length}`);
console.log(`excludedBecauseActiveEditor=${exclusion.activeEditor}`);
console.log(`excludedBecauseIncompatiblePrincipal=${exclusion.incompatiblePrincipal}`);
console.log(`excludedBecauseNoMembership=${exclusion.noMembership}`);
console.log(`eligibleDistinctReviewerCandidates=${eligible.length}`);
console.log(`reviewerProvisioningPreflightReady=${existingReady||eligible.length===1}`);
console.log('Exclusion counters are aggregate only; no reviewer identity or credential values are emitted.');
console.log('No user identities, credentials, regulatory approvals, publications, role changes, or production data mutations were emitted or performed.');

if(!existingReady&&eligible.length!==1){
  fail(`expected exactly one eligible distinct existing reviewer candidate; found ${eligible.length}`);
}
