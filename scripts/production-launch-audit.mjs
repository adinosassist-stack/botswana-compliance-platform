const CF_API='https://api.cloudflare.com/client/v4';
const ORIGIN='https://thebedesk.com';
const SCRIPT='bw-compliance-os';

const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();

function fail(message){throw new Error(`Phase 0 production launch audit failed: ${message}`)}
function safe(value){return String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,400)}
function assert(condition,message){if(!condition)fail(message)}
function mark(label,ok,detail=''){console.log(`${ok?'PASS':'MISSING'} ${label}${detail?`: ${detail}`:''}`)}

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

async function d1Count(table){
  const allowed=new Set(['users','tenants','memberships','operating_locations','employees','daily_employee_reports']);
  assert(allowed.has(table),`refusing non-whitelisted inventory table ${table}`);
  const body=await cfJson(`/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',
    body:JSON.stringify({sql:`SELECT COUNT(*) AS count FROM ${table}`})
  });
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`D1 count query failed for ${table}`);
  const rows=sets.flatMap(x=>Array.isArray(x?.results)?x.results:[]);
  const count=Number(rows?.[0]?.count);
  assert(Number.isFinite(count),`D1 count missing for ${table}`);
  return count;
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

const anti=await publicFetch('/api/auth/anti-bot-config');
assert(anti.status===200,`anti-bot config HTTP ${anti.status}`);
const antiJson=await anti.json();
assert(antiJson?.provider==='turnstile'&&antiJson?.required===true&&antiJson?.action==='register','Turnstile registration contract is not active');
mark('Turnstile registration contract',true,'required');

const root=await publicFetch('/');
assert(root.status===200,`root page HTTP ${root.status}`);
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
  if(!client)integrationProblems.push(`${provider}: ${cfg.client} missing`);
  if(redirect!==cfg.callback)integrationProblems.push(`${provider}: ${cfg.redirect} must equal ${cfg.callback}`);
  if(!hasSecret)integrationProblems.push(`${provider}: ${cfg.secret} missing`);

  let runtimeOk=false;
  try{
    const response=await publicFetch(`/api/auth/oauth/${provider}/start`,{redirect:'manual'});
    const location=String(response.headers.get('location')||'');
    if(response.status>=300&&response.status<400&&location){
      const u=new URL(location);runtimeOk=u.protocol==='https:'&&u.hostname===cfg.host;
    }
    if(!runtimeOk)integrationProblems.push(`${provider}: runtime OAuth start did not redirect to ${cfg.host} (HTTP ${response.status})`);
  }catch(e){integrationProblems.push(`${provider}: runtime OAuth probe failed ${safe(e?.message||e)}`)}
  mark(`${provider} OAuth`,!integrationProblems.some(x=>x.startsWith(`${provider}:`)),runtimeOk?'provider redirect verified':'not ready');
}

const resendSecret=await secretExists('RESEND_API_KEY');
const emailFrom=bindingValue(byName.get('EMAIL_FROM'));
const emailFromSafe=!!emailFrom&&!/example\.invalid|example\.com|REPLACE_WITH/i.test(emailFrom)&&emailFrom.includes('@');
if(!resendSecret)integrationProblems.push('email: RESEND_API_KEY missing');
if(!emailFromSafe)integrationProblems.push('email: EMAIL_FROM missing or placeholder');
mark('password-reset email configuration',resendSecret&&emailFromSafe,resendSecret&&emailFromSafe?'Resend secret + sender present':'not ready');

const inventoryTables=['users','tenants','memberships','operating_locations','employees','daily_employee_reports'];
const countEntries=[];
for(const table of inventoryTables)countEntries.push([table,await d1Count(table)]);
const counts=Object.fromEntries(countEntries);
console.log(`INFO production inventory counts users=${counts.users} tenants=${counts.tenants} memberships=${counts.memberships} operating_locations=${counts.operating_locations} employees=${counts.employees} daily_employee_reports=${counts.daily_employee_reports}`);

console.log('INFO payments intentionally closed: PAYMENT_PROVIDER=none');
console.log('INFO evidence uploads intentionally closed: EVIDENCE_UPLOADS_ENABLED=false');

if(integrationProblems.length){
  console.error('LAUNCH_INTEGRATIONS_NOT_READY');
  for(const problem of integrationProblems)console.error(`- ${problem}`);
  process.exitCode=2;
}else{
  console.log('LAUNCH_INTEGRATIONS_READY Google OAuth + Facebook OAuth + Resend sender configuration present and runtime OAuth starts verified');
}
