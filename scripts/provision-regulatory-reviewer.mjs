const CF_API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const scriptName=String(process.env.CF_WORKER_SCRIPT_NAME||'bw-compliance-os').trim();
const confirmation=String(process.env.PROVISION_CONFIRMATION||'VALIDATE_ONLY').trim();
const APPLY_CONFIRMATION='PROVISION_SINGLE_REGULATORY_REVIEWER';

function fail(message){throw new Error(`Regulatory reviewer provisioning failed: ${message}`)}
function assert(value,message){if(!value)fail(message)}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0}
function parseEmails(value){
  const values=[...new Set(String(value||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean))];
  assert(values.length>0,'reviewer allowlist is empty');
  assert(values.every(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)),'reviewer allowlist contains an invalid email');
  return values;
}

assert(String(process.env.GITHUB_ACTIONS||'')==='true','refusing to run outside GitHub Actions');
assert(token.length>=20,'CLOUDFLARE_API_TOKEN is unavailable or too short');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(scriptName==='bw-compliance-os','unexpected Worker script name');
assert(confirmation==='VALIDATE_ONLY'||confirmation===APPLY_CONFIRMATION,'unsupported provisioning confirmation');

const headers={authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json'};
async function d1(sql,params=[],{mutation=false}={}){
  const statement=String(sql||'').trim();
  if(mutation){
    assert(/^(INSERT|UPDATE)\b/i.test(statement),'mutation helper accepts INSERT or UPDATE only');
    assert(!/\b(DELETE|REPLACE|DROP|ALTER|CREATE|VACUUM|PRAGMA|ATTACH|DETACH)\b/i.test(statement),'mutation SQL contains a forbidden keyword');
  }else{
    assert(/^SELECT\b/i.test(statement),'read helper accepts SELECT only');
    assert(!/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|VACUUM|PRAGMA|ATTACH|DETACH)\b/i.test(statement),'read SQL contains a forbidden mutation keyword');
  }
  const response=await fetch(`${CF_API}/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',headers,body:JSON.stringify({sql:statement,params}),signal:AbortSignal.timeout(20000)
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok||body?.success===false) fail(`Cloudflare D1 query HTTP ${response.status}`);
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length>0&&sets.every(item=>item?.success!==false),'D1 query did not complete successfully');
  return {
    rows:sets.flatMap(item=>Array.isArray(item?.results)?item.results:[]),
    changes:sets.reduce((sum,item)=>sum+number(item?.meta?.changes),0)
  };
}

async function liveWorkerAllowlist(){
  const response=await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}/settings`,{
    method:'GET',headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(20000)
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

async function loadPrincipals(){
  return (await d1(`SELECT user_id,email,role,active FROM platform_regulatory_principals ORDER BY user_id`)).rows;
}

const live=await liveWorkerAllowlist();
let principals=await loadPrincipals();
const activePrincipals=principals.filter(row=>number(row.active)===1);
const activeEditorIds=new Set(activePrincipals.filter(row=>row.role==='editor'||row.role==='admin').map(row=>String(row.user_id)));
const existingReady=makerCheckerReady(principals);

console.log('GOVERNED_REGULATORY_REVIEWER_PROVISIONING');
console.log(`mode=${confirmation===APPLY_CONFIRMATION?'apply':'validate-only'}`);
console.log(`liveReviewerAllowlistCount=${live.length}`);
console.log(`activeRegulatoryPrincipals=${activePrincipals.length}`);
console.log(`makerCheckerReadyBefore=${existingReady}`);

if(existingReady){
  console.log('makerCheckerReadyAfter=true');
  console.log('No production mutation was required.');
  process.exit(0);
}

const placeholders=live.map(()=>'?').join(',');
const users=(await d1(`SELECT u.id,u.email,COUNT(m.user_id) AS membership_count FROM users u LEFT JOIN memberships m ON m.user_id=u.id WHERE lower(u.email) IN (${placeholders}) GROUP BY u.id,u.email ORDER BY u.id`,live)).rows;
const principalByUser=new Map(principals.map(row=>[String(row.user_id),row]));
const eligible=users.filter(user=>{
  const id=String(user.id);
  if(activeEditorIds.has(id)) return false;
  const principal=principalByUser.get(id);
  if(principal&&(principal.role!=='reviewer'||number(principal.active)!==0)) return false;
  return number(user.membership_count)>0;
});

console.log(`allowlistedExistingUsers=${users.length}`);
console.log(`eligibleDistinctReviewerCandidates=${eligible.length}`);
assert(eligible.length===1,`expected exactly one eligible distinct existing reviewer candidate; found ${eligible.length}`);

if(confirmation!=='PROVISION_SINGLE_REGULATORY_REVIEWER'){
  console.log('reviewerProvisioningPreflightReady=true');
  console.log('Validate-only mode completed without identity, role, regulatory content, or customer-data mutation.');
  process.exit(0);
}

assert(String(process.env.GITHUB_EVENT_NAME||'')==='workflow_dispatch','production mutation requires workflow_dispatch');
assert(String(process.env.GITHUB_REF||'')==='refs/heads/main','production mutation requires the main branch');

const candidate=eligible[0];
const candidateId=String(candidate.id);
const candidateEmail=String(candidate.email||'').trim().toLowerCase();
assert(candidateId,'eligible reviewer candidate id is missing');
assert(live.includes(candidateEmail),'eligible reviewer candidate no longer matches the live reviewer allowlist');

const existing=principalByUser.get(candidateId)||null;
let mutation;
if(existing){
  assert(existing.role==='reviewer'&&number(existing.active)===0,'existing principal is not an inactive reviewer');
  mutation=await d1(`UPDATE platform_regulatory_principals SET email=?,active=1 WHERE user_id=? AND role='reviewer' AND active=0 AND EXISTS (SELECT 1 FROM users u WHERE u.id=? AND lower(u.email)=? AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id))`,[candidateEmail,candidateId,candidateId,candidateEmail],{mutation:true});
}else{
  mutation=await d1(`INSERT INTO platform_regulatory_principals(user_id,email,role,active,created_at) SELECT u.id,u.email,'reviewer',1,? FROM users u WHERE u.id=? AND lower(u.email)=? AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id) AND NOT EXISTS (SELECT 1 FROM platform_regulatory_principals p WHERE p.user_id=u.id)`,[new Date().toISOString(),candidateId,candidateEmail],{mutation:true});
}
assert(mutation.changes===1,`expected exactly one reviewer-principal change; observed ${mutation.changes}`);

principals=await loadPrincipals();
const provisioned=principals.find(row=>String(row.user_id)===candidateId);
assert(provisioned&&provisioned.role==='reviewer'&&number(provisioned.active)===1,'reviewer principal did not persist as active reviewer');
assert(makerCheckerReady(principals),'independent maker-checker remains unready after reviewer provisioning');

console.log('reviewerPrincipalChanges=1');
console.log('makerCheckerReadyAfter=true');
console.log('Provisioned one existing allowlisted member as an independent reviewer. No account creation, password reset, source approval, rule publication, or regulatory-content mutation was performed.');
