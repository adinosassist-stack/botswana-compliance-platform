import fs from 'node:fs';

const CF_API='https://api.cloudflare.com/client/v4';
const ORIGIN='https://thebedesk.com';
const SCRIPT='bw-compliance-os';
const MAX_LEGACY_ORPHAN_TENANTS=1;
const D1_DEPENDENCY_QUERY_CONCURRENCY=6;

const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();

function fail(message){throw new Error(`Phase 0 production launch audit failed: ${message}`)}
function safe(value){return String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,400)}
function assert(condition,message){if(!condition)fail(message)}
function mark(label,ok,detail=''){console.log(`${ok?'PASS':'MISSING'} ${label}${detail?`: ${detail}`:''}`)}
function deferred(label,detail=''){console.log(`DEFERRED ${label}${detail?`: ${detail}`:''}`)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');

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

async function secretExists(name){
  const response=await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${SCRIPT}/secrets/${encodeURIComponent(name)}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}
  });
  // Deliberately never read or print the response body. The API documents this endpoint as value-omitting.
  return response.status===200;
}

async function publicFetch(path,{redirect='follow'}={}){
  return fetch(`${ORIGIN}${path}`,{redirect,headers:{'user-agent':'ThebeDesk-Phase0-Launch-Audit/1.0','accept':'application/json,text/html;q=0.9,*/*;q=0.8'}});
}

function bindingValue(binding){
  if(!binding||typeof binding!=='object')return undefined;
  if(binding.type==='plain_text'&&typeof binding.text==='string')return binding.text;
  return undefined;
}

async function d1Rows(label,sql,params=[]){
  const statement=String(sql||'').trim();
  assert(/^SELECT\b/i.test(statement),`refusing non-read-only D1 audit query for ${label}`);
  assert(Array.isArray(params)&&params.length<=100,`invalid D1 audit parameters for ${label}`);
  const body=await cfJson(`/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',
    body:JSON.stringify({sql:statement,params})
  });
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`D1 row query failed for ${label}`);
  return sets.flatMap(x=>Array.isArray(x?.results)?x.results:[]);
}
function regulatoryDateValid(value){
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;
  const parsed=new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===text;
}

async function d1Scalar(label,sql){
  const statement=String(sql||'').trim();
  assert(/^SELECT\b/i.test(statement),`refusing non-read-only D1 audit query for ${label}`);
  const body=await cfJson(`/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',
    body:JSON.stringify({sql:statement})
  });
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`D1 scalar query failed for ${label}`);
  const rows=sets.flatMap(x=>Array.isArray(x?.results)?x.results:[]);
  const count=Number(rows?.[0]?.count);
  assert(Number.isFinite(count),`D1 scalar result missing for ${label}`);
  return count;
}

async function d1Count(table){
  const allowed=new Set(['users','tenants','memberships','operating_locations','employees','daily_employee_reports']);
  assert(allowed.has(table),`refusing non-whitelisted inventory table ${table}`);
  return d1Scalar(`inventory ${table}`,`SELECT COUNT(*) AS count FROM ${table}`);
}

console.log('=== Thebe Desk Phase 0 production launch audit ===');

const settings=await cfJson(`/accounts/${accountId}/workers/scripts/${SCRIPT}/settings`);
const bindings=Array.isArray(settings?.result?.bindings)?settings.result.bindings:[];
const byName=new Map(bindings.filter(x=>x&&x.name).map(x=>[String(x.name),x]));

const requiredBindings=[['DB','d1'],['EVIDENCE','r2_bucket'],['AI','ai']];
for(const [name,expectedType] of requiredBindings){
  const b=byName.get(name);assert(b,`required Worker binding ${name} is missing`);
  assert(String(b.type||'')===expectedType,`${name} binding type expected ${expectedType} got ${String(b.type||'missing')}`);
  mark(`binding ${name}`,true,expectedType);
}

const expectedPlain={
  AI_FEATURES_DEFAULT:'on',
  PUBLIC_APP_URL:ORIGIN,
  PUBLIC_ORIGIN:ORIGIN,
  PAYMENT_PROVIDER:'none',
  EVIDENCE_UPLOADS_ENABLED:'false'
};
for(const [name,expected] of Object.entries(expectedPlain)){
  const actual=bindingValue(byName.get(name));
  assert(actual===expected,`${name} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  mark(name,true,actual);
}

const live=await publicFetch('/api/live');
assert(live.status===200,`/api/live HTTP ${live.status}`);
const liveJson=await live.json();assert(liveJson?.ok===true,'/api/live did not return ok=true');
mark('/api/live',true,'200 ok=true');

const ready=await publicFetch('/api/ready');
assert(ready.status===200,`/api/ready HTTP ${ready.status}`);
const readyJson=await ready.json();
assert(readyJson?.ok===true&&readyJson?.d1===true&&readyJson?.r2===true&&readyJson?.schemaReady===true&&readyJson?.requiredConfigReady===true,'/api/ready did not prove full core readiness');
mark('/api/ready',true,`version=${safe(readyJson.version)} schemaReady=true configReady=true`);

const registrationProof=await fetch(`${ORIGIN}/api/auth/registration-proof/challenge`,{
  method:'POST',
  redirect:'error',
  headers:{
    'user-agent':'ThebeDesk-Phase0-Launch-Audit/1.0',
    'accept':'application/json',
    'content-type':'application/json',
    'origin':ORIGIN
  },
  body:'{}'
});
assert(registrationProof.status===200,`registration proof challenge HTTP ${registrationProof.status}`);
assert(String(registrationProof.headers.get('cache-control')||'').toLowerCase().includes('no-store'),'registration proof challenge must be no-store');
assert(String(registrationProof.headers.get('x-content-type-options')||'').toLowerCase()==='nosniff','registration proof challenge must set x-content-type-options=nosniff');
const registrationProofJson=await registrationProof.json();
const registrationProofToken=String(registrationProofJson?.token||'');
const registrationProofDifficulty=Number(registrationProofJson?.difficulty);
const registrationProofTtl=Number(registrationProofJson?.expiresInSeconds);
assert(registrationProofJson?.provider==='thebe_proof'&&registrationProofJson?.required===true&&registrationProofJson?.action==='register','first-party registration proof contract is not active');
assert(registrationProofToken.length>=80&&registrationProofToken.includes('.'),'registration proof challenge token is missing or malformed');
assert(Number.isInteger(registrationProofDifficulty)&&registrationProofDifficulty>=8&&registrationProofDifficulty<=16,`registration proof difficulty is outside the hardened range: ${safe(registrationProofDifficulty)}`);
assert(Number.isInteger(registrationProofTtl)&&registrationProofTtl>=60&&registrationProofTtl<=600,`registration proof TTL is outside the hardened range: ${safe(registrationProofTtl)}`);
mark('first-party registration proof',true,`difficulty=${registrationProofDifficulty} ttl=${registrationProofTtl}s`);

const root=await publicFetch('/');
assert(root.status===200,`root page HTTP ${root.status}`);
const productionEntry=fs.readFileSync('cloudflare/src/production-entry.js','utf8');
const dockReleaseMatch=productionEntry.match(/const THEBE_AI_DOCK_RELEASE="([0-9]{8}[A-Za-z0-9._-]{1,48})";/);
assert(dockReleaseMatch?.[1],'production entry does not expose a valid Thebe AI dock release constant');
const expectedDockRelease=dockReleaseMatch[1];
const liveDockRelease=String(root.headers.get('x-thebe-ai-dock')||'');
assert(liveDockRelease===expectedDockRelease,`live Thebe AI dock release expected ${expectedDockRelease} got ${liveDockRelease||'missing'}`);
mark('Thebe AI dock response release',true,liveDockRelease);
const securityHeaders={
  'strict-transport-security':v=>/max-age=\d+/.test(v),
  'x-content-type-options':v=>v.toLowerCase()==='nosniff',
  'x-frame-options':v=>v.toUpperCase()==='DENY',
  'referrer-policy':v=>v.length>0,
  'content-security-policy':v=>v.includes("default-src 'self'")&&v.includes("frame-ancestors 'none'"),
  'cross-origin-opener-policy':v=>v.length>0,
  'cross-origin-resource-policy':v=>v.length>0
};
for(const [name,check] of Object.entries(securityHeaders)){
  const value=String(root.headers.get(name)||'');assert(check(value),`root security header ${name} is missing or invalid`);mark(`header ${name}`,true);
}

const expectedOauth={
  google:{client:'GOOGLE_OAUTH_CLIENT_ID',redirect:'GOOGLE_OAUTH_REDIRECT_URI',secret:'GOOGLE_OAUTH_CLIENT_SECRET',callback:`${ORIGIN}/api/auth/oauth/google/callback`,host:'accounts.google.com'},
  facebook:{client:'FACEBOOK_APP_ID',redirect:'FACEBOOK_OAUTH_REDIRECT_URI',secret:'FACEBOOK_APP_SECRET',callback:`${ORIGIN}/api/auth/oauth/facebook/callback`,host:'www.facebook.com'}
};
const integrationProblems=[];
for(const [provider,cfg] of Object.entries(expectedOauth)){
  const client=bindingValue(byName.get(cfg.client));
  const redirect=bindingValue(byName.get(cfg.redirect));
  const hasSecret=await secretExists(cfg.secret);
  const hasClient=!!client;
  const hasRedirect=!!redirect;
  const anyConfigured=hasClient||hasRedirect||hasSecret;

  if(!anyConfigured){
    let failClosed=false;
    try{
      const response=await publicFetch(`/api/auth/oauth/${provider}/start`,{redirect:'manual'});
      failClosed=response.status===503;
      if(!failClosed)integrationProblems.push(`${provider}: deferred OAuth start must fail closed with HTTP 503, got HTTP ${response.status}`);
    }catch(e){integrationProblems.push(`${provider}: deferred OAuth fail-closed probe failed ${safe(e?.message||e)}`)}
    if(failClosed)deferred(`${provider} OAuth`,'fully absent and runtime start fails closed with HTTP 503');
    continue;
  }

  if(!hasClient)integrationProblems.push(`${provider}: ${cfg.client} missing while provider is partially configured`);
  if(redirect!==cfg.callback)integrationProblems.push(`${provider}: ${cfg.redirect} must equal ${cfg.callback} when provider is configured`);
  if(!hasSecret)integrationProblems.push(`${provider}: ${cfg.secret} missing while provider is partially configured`);

  const structurallyReady=hasClient&&redirect===cfg.callback&&hasSecret;
  let runtimeOk=false;
  if(structurallyReady){
    try{
      const response=await publicFetch(`/api/auth/oauth/${provider}/start`,{redirect:'manual'});
      const location=String(response.headers.get('location')||'');
      if(response.status>=300&&response.status<400&&location){
        const u=new URL(location);runtimeOk=u.protocol==='https:'&&u.hostname===cfg.host;
      }
      if(!runtimeOk)integrationProblems.push(`${provider}: runtime OAuth start did not redirect to ${cfg.host} (HTTP ${response.status})`);
    }catch(e){integrationProblems.push(`${provider}: runtime OAuth probe failed ${safe(e?.message||e)}`)}
  }
  mark(`${provider} OAuth`,structurallyReady&&runtimeOk,structurallyReady&&runtimeOk?'provider redirect verified':'partially configured or runtime verification failed');
}

const resendSecret=await secretExists('RESEND_API_KEY');
const emailFrom=bindingValue(byName.get('EMAIL_FROM'));
const hasEmailFrom=!!emailFrom;
const emailFromSafe=hasEmailFrom&&!/example\.invalid|example\.com|REPLACE_WITH/i.test(emailFrom)&&emailFrom.includes('@');
if(!resendSecret&&!hasEmailFrom){
  deferred('password-reset email','RESEND_API_KEY and EMAIL_FROM fully absent');
}else{
  if(!resendSecret)integrationProblems.push('email: RESEND_API_KEY missing while transactional email is partially configured');
  if(!emailFromSafe)integrationProblems.push('email: EMAIL_FROM missing, malformed, or placeholder while transactional email is partially configured');
  mark('password-reset email configuration',resendSecret&&emailFromSafe,resendSecret&&emailFromSafe?'Resend secret + sender present':'partially configured');
}

const inventoryTables=['users','tenants','memberships','operating_locations','employees','daily_employee_reports'];
const countEntries=[];
for(const table of inventoryTables)countEntries.push([table,await d1Count(table)]);
const counts=Object.fromEntries(countEntries);
console.log(`INFO production inventory counts users=${counts.users} tenants=${counts.tenants} memberships=${counts.memberships} operating_locations=${counts.operating_locations} employees=${counts.employees} daily_employee_reports=${counts.daily_employee_reports}`);

const executableRules=await d1Rows('executable regulatory rules',`SELECT id,rule_key,version,status,effective_from,effective_to,source_ids_json,definition_hash,created_by_user_id,approved_by_user_id,published_by_user_id FROM regulatory_rules WHERE status IN ('approved','published') ORDER BY rule_key,version`);
for(const rule of executableRules){
  const label=`${safe(rule.rule_key)}@v${Number(rule.version||0)}`;
  assert(regulatoryDateValid(rule.effective_from),`regulatory rule ${label} has no valid effective_from date`);
  if(rule.effective_to){
    assert(regulatoryDateValid(rule.effective_to),`regulatory rule ${label} has invalid effective_to date`);
    assert(String(rule.effective_to)>=String(rule.effective_from),`regulatory rule ${label} has effective_to before effective_from`);
  }
  let sourceIds=[];try{sourceIds=JSON.parse(String(rule.source_ids_json||'[]'))}catch{}
  assert(Array.isArray(sourceIds)&&sourceIds.length>0,`regulatory rule ${label} has no source references`);
  sourceIds=sourceIds.map(String);assert(new Set(sourceIds).size===sourceIds.length,`regulatory rule ${label} has duplicate source references`);
  const placeholders=sourceIds.map(()=>'?').join(',');
  const sources=await d1Rows(`regulatory sources for ${label}`,`SELECT id,status,verification_status,content_hash,metadata_hash,latest_snapshot_version FROM regulatory_sources WHERE id IN (${placeholders})`,sourceIds);
  assert(sources.length===sourceIds.length,`regulatory rule ${label} references a missing source`);
  for(const source of sources){
    const sourceLabel=safe(source.id);
    assert(source.status==='approved'&&source.verification_status==='verified',`regulatory rule ${label} source ${sourceLabel} is not approved + verified`);
    assert(String(source.content_hash||'')&&String(source.metadata_hash||''),`regulatory rule ${label} source ${sourceLabel} is missing current hashes`);
    assert(Number(source.latest_snapshot_version||0)>=1,`regulatory rule ${label} source ${sourceLabel} has no snapshot version`);
    const snapshots=await d1Rows(`latest snapshot ${sourceLabel}`,`SELECT version,content_hash,metadata_hash,object_key,captured_by_user_id FROM regulatory_source_snapshots WHERE source_id=? ORDER BY version DESC LIMIT 1`,[source.id]);
    const snapshot=snapshots[0];
    assert(snapshot&&Number(snapshot.version)===Number(source.latest_snapshot_version),`regulatory rule ${label} source ${sourceLabel} snapshot version drift`);
    assert(String(snapshot.content_hash||'')===String(source.content_hash||'')&&String(snapshot.metadata_hash||'')===String(source.metadata_hash||''),`regulatory rule ${label} source ${sourceLabel} snapshot hashes do not match the current source`);
    assert(String(snapshot.object_key||'')&&String(snapshot.captured_by_user_id||''),`regulatory rule ${label} source ${sourceLabel} snapshot lacks stored-object or capturer identity`);
    const reviews=await d1Rows(`latest source review ${sourceLabel}`,`SELECT reviewer_user_id,content_hash,metadata_hash FROM regulatory_source_reviews WHERE source_id=? AND decision='approved' ORDER BY created_at DESC LIMIT 1`,[source.id]);
    const review=reviews[0];
    assert(review&&String(review.reviewer_user_id||''),`regulatory rule ${label} source ${sourceLabel} has no approving reviewer identity`);
    assert(String(review.content_hash||'')===String(source.content_hash||'')&&String(review.metadata_hash||'')===String(source.metadata_hash||''),`regulatory rule ${label} source ${sourceLabel} approval is stale for the current snapshot`);
  }
  const history=await d1Scalar(`rule history ${label}`,`SELECT COUNT(*) AS count FROM regulatory_rule_events WHERE rule_id='${String(rule.id).replaceAll("'","''")}'`);
  assert(history>=1,`regulatory rule ${label} has no change history`);
  const approvals=await d1Rows(`rule approval ${label}`,`SELECT reviewer_user_id,definition_hash FROM regulatory_rule_reviews WHERE rule_id=? AND decision='approved' ORDER BY created_at DESC LIMIT 1`,[rule.id]);
  const approval=approvals[0];
  assert(approval&&String(approval.reviewer_user_id||''),`regulatory rule ${label} has no approving rule reviewer identity`);
  assert(String(approval.definition_hash||'')===String(rule.definition_hash||''),`regulatory rule ${label} changed after approval`);
  assert(String(rule.created_by_user_id||'')&&String(rule.approved_by_user_id||''),`regulatory rule ${label} is missing creator or approver identity`);
  assert(String(rule.created_by_user_id)!==String(rule.approved_by_user_id),`regulatory rule ${label} violates maker-checker separation`);
  if(rule.status==='published')assert(String(rule.published_by_user_id||''),`published regulatory rule ${label} is missing publisher identity`);
}
mark('live regulatory ruleset integrity',true,`${executableRules.length} approved/published rule(s) checked for effective dates, source snapshots, current approvals, reviewer identity, maker-checker separation and change history`);

const orphanPredicate=`NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id=t.id)`;
const orphanTenants=await d1Scalar('orphan tenants',`SELECT COUNT(*) AS count FROM tenants t WHERE ${orphanPredicate}`);
const orphanUsers=await d1Scalar('orphan users',`SELECT COUNT(*) AS count FROM users u WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id)`);
const orphanSubscriptions=await d1Scalar('orphan tenant subscriptions',`SELECT COUNT(*) AS count FROM subscriptions s WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.id=s.tenant_id AND ${orphanPredicate})`);
const orphanAuditChainState=await d1Scalar('orphan tenant audit chain state',`SELECT COUNT(*) AS count FROM audit_chain_state a WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.id=a.tenant_id AND ${orphanPredicate})`);

const schema=fs.readFileSync('cloudflare/schema.sql','utf8');
const tableRe=/CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\((.*?)\);/gis;
const legacyAllowedDependencies=new Set(['memberships.tenant_id','subscriptions.tenant_id','audit_chain_state.tenant_id']);
const dependencySelects=[];
for(const match of schema.matchAll(tableRe)){
  const table=match[1],body=match[2];
  assert(/^[A-Za-z0-9_]+$/.test(table),`unsafe schema table identifier ${safe(table)}`);
  const tenantColumns=[...new Set([...body.matchAll(/\b([A-Za-z0-9_]*tenant_id)\b/gi)].map(x=>x[1]))];
  for(const column of tenantColumns){
    assert(/^[A-Za-z0-9_]+$/.test(column),`unsafe schema tenant column identifier ${safe(column)}`);
    if(legacyAllowedDependencies.has(`${table}.${column}`))continue;
    dependencySelects.push(`SELECT COUNT(*) AS count FROM ${table} r WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.id=r.${column} AND ${orphanPredicate})`);
  }
}
assert(dependencySelects.length>0,'tenant integrity dependency inventory is empty');
const dependencyCounts=new Array(dependencySelects.length);
let dependencyCursor=0;
async function dependencyWorker(){
  for(;;){
    const index=dependencyCursor++;
    if(index>=dependencySelects.length)return;
    dependencyCounts[index]=await d1Scalar(`orphan tenant business dependency query ${index+1}`,dependencySelects[index]);
  }
}
const dependencyConcurrency=Math.min(D1_DEPENDENCY_QUERY_CONCURRENCY,dependencySelects.length);
await Promise.all(Array.from({length:dependencyConcurrency},()=>dependencyWorker()));
const orphanBusinessDependencyRows=dependencyCounts.reduce((sum,count)=>sum+count,0);
console.log(`INFO tenant integrity dependency sweep columns=${dependencySelects.length} queries=${dependencySelects.length} concurrency=${dependencyConcurrency}`);

assert(orphanUsers===0,`orphan users detected: ${orphanUsers}`);
assert(orphanTenants<=MAX_LEGACY_ORPHAN_TENANTS,`orphan tenant count ${orphanTenants} exceeds legacy baseline ${MAX_LEGACY_ORPHAN_TENANTS}`);
assert(orphanSubscriptions===orphanTenants,`orphan tenant subscription residue mismatch tenants=${orphanTenants} subscriptions=${orphanSubscriptions}`);
assert(orphanAuditChainState===orphanTenants,`orphan tenant audit-chain residue mismatch tenants=${orphanTenants} auditChainState=${orphanAuditChainState}`);
assert(orphanBusinessDependencyRows===0,`orphan tenants retain non-baseline business data rows=${orphanBusinessDependencyRows}`);
mark('tenant integrity baseline',true,`orphanTenants=${orphanTenants}/${MAX_LEGACY_ORPHAN_TENANTS} orphanUsers=0 businessDependencyRows=0`);
if(orphanTenants>0)console.log(`LEGACY_DATA_DEBT orphan_tenants=${orphanTenants}; bounded pre-fix residue only, no automatic deletion performed`);

console.log('INFO payments intentionally closed: PAYMENT_PROVIDER=none');
console.log('INFO evidence uploads intentionally closed: EVIDENCE_UPLOADS_ENABLED=false');

if(integrationProblems.length){
  console.error('LAUNCH_INTEGRATIONS_NOT_READY');
  for(const problem of integrationProblems)console.error(`- ${problem}`);
  process.exitCode=2;
}else{
  console.log('LAUNCH_INTEGRATIONS_READY_OR_DEFERRED configured integrations verified; deferred integrations remain fully absent and fail closed');
}
