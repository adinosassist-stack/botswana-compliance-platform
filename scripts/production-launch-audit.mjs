const CF_API='https://api.cloudflare.com/client/v4';
const ORIGIN='https://thebedesk.com';
const SCRIPT='bw-compliance-os';
const EXPECTED_DEPLOY_SHA=String(process.env.EXPECTED_DEPLOY_SHA||'').trim();

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
assert(/^[0-9a-f]{40}$/.test(EXPECTED_DEPLOY_SHA),'EXPECTED_DEPLOY_SHA must be the exact lowercase 40-character deployed commit SHA');
mark('deployment authority SHA',true,EXPECTED_DEPLOY_SHA);

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
  return response.status===200;
}

async function publicFetch(path,{redirect='follow',headers={}}={}){
  return fetch(`${ORIGIN}${path}`,{redirect,headers:{'user-agent':'ThebeDesk-Phase0-Launch-Audit/2.0','accept':'application/json,text/html;q=0.9,*/*;q=0.8',...headers}});
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

function assertSecurityHeaders(response,label){
  const securityHeaders={
    'strict-transport-security':v=>/max-age=\d+/.test(v),
    'x-content-type-options':v=>v.toLowerCase()==='nosniff',
    'x-frame-options':v=>v.toUpperCase()==='DENY',
    'referrer-policy':v=>v.length>0,
    'content-security-policy':v=>v.includes("default-src 'self'")&&v.includes("frame-ancestors 'none'")&&v.includes("object-src 'none'"),
    'cross-origin-opener-policy':v=>v.length>0,
    'cross-origin-resource-policy':v=>v.length>0
  };
  for(const [name,check] of Object.entries(securityHeaders)){
    const value=String(response.headers.get(name)||'');assert(check(value),`${label} security header ${name} is missing or invalid`);
  }
}

async function expectHtml(path,{titleToken='Thebe Desk'}={}){
  const response=await publicFetch(path);
  assert(response.status===200,`${path} HTTP ${response.status}`);
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  assert(type.includes('text/html'),`${path} content-type is not HTML: ${type}`);
  assertSecurityHeaders(response,path);
  const body=await response.text();
  assert(body.length>1000,`${path} HTML is unexpectedly small`);
  assert(body.includes('<title>')&&body.includes(titleToken),`${path} title is missing expected brand token`);
  assert(/<meta\s+name="description"\s+content="[^"]{20,}"/i.test(body),`${path} meta description missing/too short`);
  assert(/<meta\s+name="robots"\s+content="[^"]*index/i.test(body),`${path} robots meta must remain indexable`);
  assert(/<link\s+rel="canonical"\s+href="https:\/\/thebedesk\.com\//i.test(body),`${path} canonical URL is missing or off-origin`);
  assert(/property="og:title"/i.test(body)&&/name="twitter:card"/i.test(body),`${path} social metadata incomplete`);
  assert(!body.includes('__SEO_'),`${path} contains unresolved SEO placeholders`);
  return {response,body};
}

async function expectPng(path,{width=null,height=null}={}){
  const response=await publicFetch(path);
  assert(response.status===200,`${path} HTTP ${response.status}`);
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  assert(type.includes('image/png'),`${path} must be image/png, got ${type}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert(bytes.length>64,`${path} is unexpectedly small`);
  assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),`${path} is not a valid PNG signature`);
  if(width!==null)assert(bytes.readUInt32BE(16)===width,`${path} width expected ${width} got ${bytes.readUInt32BE(16)}`);
  if(height!==null)assert(bytes.readUInt32BE(20)===height,`${path} height expected ${height} got ${bytes.readUInt32BE(20)}`);
  mark(`asset ${path}`,true,`${bytes.length} bytes`);
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

const expectedPlain={AI_FEATURES_DEFAULT:'on',PUBLIC_APP_URL:ORIGIN,PUBLIC_ORIGIN:ORIGIN,PAYMENT_PROVIDER:'none',EVIDENCE_UPLOADS_ENABLED:'false'};
for(const [name,expected] of Object.entries(expectedPlain)){
  const actual=bindingValue(byName.get(name));assert(actual===expected,`${name} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);mark(name,true,actual);
}

const live=await publicFetch('/api/live');
assert(live.status===200,`/api/live HTTP ${live.status}`);
assertSecurityHeaders(live,'/api/live');
const liveJson=await live.json();assert(liveJson?.ok===true,'/api/live did not return ok=true');
mark('/api/live',true,'200 ok=true');

const ready=await publicFetch('/api/ready');
assert(ready.status===200,`/api/ready HTTP ${ready.status}`);
assertSecurityHeaders(ready,'/api/ready');
const readyJson=await ready.json();
assert(readyJson?.ok===true&&readyJson?.d1===true&&readyJson?.r2===true&&readyJson?.schemaReady===true&&readyJson?.requiredConfigReady===true,'/api/ready did not prove full core readiness');
assert(readyJson?.agenticAuthoritySchemaReady===true,'/api/ready did not prove delegated-authority schema readiness');
mark('/api/ready',true,`version=${safe(readyJson.version)} schemaReady=true configReady=true authoritySchemaReady=true`);

const registrationProof=await fetch(`${ORIGIN}/api/auth/registration-proof/challenge`,{
  method:'POST',redirect:'error',headers:{'user-agent':'ThebeDesk-Phase0-Launch-Audit/2.0','accept':'application/json','content-type':'application/json','origin':ORIGIN},body:'{}'
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

const root=await expectHtml('/');
assert(root.body.includes('rel="manifest"')&&root.body.includes('/assets/favicon-96.png')&&root.body.includes('/assets/apple-touch-icon.png'),'root favicon/manifest links incomplete');
mark('root SEO + security + PWA links',true);

const seoRoutes=['/pricing/','/burs-tax-compliance-botswana/','/cipa-compliance-botswana/','/business-licences-botswana/','/employment-compliance-botswana/','/compliance-evidence-botswana/','/tender-readiness-botswana/'];
for(const route of seoRoutes){await expectHtml(route);mark(`SEO route ${route}`,true)}

const robots=await publicFetch('/robots.txt');
assert(robots.status===200,`/robots.txt HTTP ${robots.status}`);
const robotsText=await robots.text();assert(/User-agent:\s*\*/i.test(robotsText)&&/Sitemap:\s*https:\/\/thebedesk\.com\/sitemap\.xml/i.test(robotsText),'robots.txt contract invalid');mark('/robots.txt',true);
const sitemap=await publicFetch('/sitemap.xml');
assert(sitemap.status===200,`/sitemap.xml HTTP ${sitemap.status}`);
const sitemapText=await sitemap.text();
for(const route of ['/',...seoRoutes])assert(sitemapText.includes(`${ORIGIN}${route}`),`sitemap missing ${route}`);
assert(!sitemapText.includes('__SEO_'),'sitemap contains unresolved placeholder');mark('/sitemap.xml',true);

const manifestResponse=await publicFetch('/manifest.webmanifest');
assert(manifestResponse.status===200,`/manifest.webmanifest HTTP ${manifestResponse.status}`);
const manifest=await manifestResponse.json();
assert(manifest?.name==='Thebe Desk'&&manifest?.short_name==='Thebe Desk'&&manifest?.start_url==='/'&&manifest?.display==='standalone','web manifest core identity/install contract invalid');
for(const size of ['192x192','512x512'])assert((manifest.icons||[]).some(x=>x?.sizes===size&&x?.type==='image/png'),`manifest missing PNG ${size} icon`);
mark('/manifest.webmanifest',true);

await expectPng('/assets/favicon-96.png',{width:96,height:96});
await expectPng('/assets/apple-touch-icon.png',{width:180,height:180});
await expectPng('/assets/thebe-desk-icon-192.png',{width:192,height:192});
await expectPng('/assets/thebe-desk-icon-512.png',{width:512,height:512});
await expectPng('/assets/thebe-desk-favicon-512.png',{width:512,height:512});
await expectPng('/assets/thebe-desk-logo-symbol.png');

const serviceWorker=await publicFetch('/sw.js');
assert(serviceWorker.status===200,`/sw.js HTTP ${serviceWorker.status}`);
const swType=String(serviceWorker.headers.get('content-type')||'').toLowerCase();
assert(swType.includes('javascript'),`/sw.js has invalid content-type ${swType}`);
const swText=await serviceWorker.text();assert(swText.length>200&&!/<html/i.test(swText),'/sw.js appears missing or replaced by HTML');mark('/sw.js',true);

const unauthState=await publicFetch('/api/state');
assert([401,403].includes(unauthState.status),`unauthenticated /api/state should fail closed, got HTTP ${unauthState.status}`);mark('workspace auth boundary',true,`HTTP ${unauthState.status}`);

const encodingAbuse=await fetch(`${ORIGIN}/api/auth/login`,{method:'POST',redirect:'error',headers:{'user-agent':'ThebeDesk-Phase0-Launch-Audit/2.0','accept':'application/json','content-type':'application/json','content-encoding':'gzip','origin':ORIGIN},body:'{}'});
const encodingBody=await encodingAbuse.json().catch(()=>({}));
assert(encodingAbuse.status===415&&encodingBody?.error==='unsupported_content_encoding',`unsupported_content_encoding must fail closed with 415, got ${encodingAbuse.status}/${safe(encodingBody?.error)}`);mark('unsupported content-encoding abuse',true,'415 fail-closed');

const hugePayload=JSON.stringify({email:'launch-audit@example.invalid',password:'x'.repeat(1024*1024+4096)});
const oversized=await fetch(`${ORIGIN}/api/auth/login`,{method:'POST',redirect:'error',headers:{'user-agent':'ThebeDesk-Phase0-Launch-Audit/2.0','accept':'application/json','content-type':'application/json','origin':ORIGIN},body:hugePayload});
const oversizedBody=await oversized.json().catch(()=>({}));
assert(oversized.status===413&&oversizedBody?.error==='request_too_large',`request_too_large must fail closed with 413, got ${oversized.status}/${safe(oversizedBody?.error)}`);mark('oversized request abuse',true,'413 fail-closed');

const burstPaths=['/','/api/live','/api/ready','/pricing/','/burs-tax-compliance-botswana/','/cipa-compliance-botswana/','/assets/favicon-96.png','/manifest.webmanifest'];
const burst=await Promise.all(Array.from({length:32},async(_,i)=>{
  const path=burstPaths[i%burstPaths.length];
  try{const response=await publicFetch(path);await response.arrayBuffer();return {path,status:response.status}}catch(error){return {path,status:0,error:safe(error?.message||error)}}
}));
const serverFailures=burst.filter(x=>x.status===0||x.status>=500);
const successful=burst.filter(x=>x.status>=200&&x.status<400);
assert(serverFailures.length===0,`extreme-use burst produced server/network failures: ${serverFailures.map(x=>`${x.path}:${x.status||x.error}`).join(', ')}`);
assert(successful.length>=28,`extreme-use burst had too many throttled/non-success responses: ${successful.length}/32 successful`);
mark('extreme-use burst',true,`${successful.length}/32 HTTP success, 0 server failures`);

const expectedOauth={
  google:{client:'GOOGLE_OAUTH_CLIENT_ID',redirect:'GOOGLE_OAUTH_REDIRECT_URI',secret:'GOOGLE_OAUTH_CLIENT_SECRET',callback:`${ORIGIN}/api/auth/oauth/google/callback`,host:'accounts.google.com'},
  facebook:{client:'FACEBOOK_APP_ID',redirect:'FACEBOOK_OAUTH_REDIRECT_URI',secret:'FACEBOOK_APP_SECRET',callback:`${ORIGIN}/api/auth/oauth/facebook/callback`,host:'www.facebook.com'}
};
const integrationProblems=[];
for(const [provider,cfg] of Object.entries(expectedOauth)){
  const client=bindingValue(byName.get(cfg.client));const redirect=bindingValue(byName.get(cfg.redirect));const hasSecret=await secretExists(cfg.secret);
  if(!client)integrationProblems.push(`${provider}: ${cfg.client} missing`);
  if(redirect!==cfg.callback)integrationProblems.push(`${provider}: ${cfg.redirect} must equal ${cfg.callback}`);
  if(!hasSecret)integrationProblems.push(`${provider}: ${cfg.secret} missing`);
  let runtimeOk=false;
  try{const response=await publicFetch(`/api/auth/oauth/${provider}/start`,{redirect:'manual'});const location=String(response.headers.get('location')||'');if(response.status>=300&&response.status<400&&location){const u=new URL(location);runtimeOk=u.protocol==='https:'&&u.hostname===cfg.host}if(!runtimeOk)integrationProblems.push(`${provider}: runtime OAuth start did not redirect to ${cfg.host} (HTTP ${response.status})`)}catch(e){integrationProblems.push(`${provider}: runtime OAuth probe failed ${safe(e?.message||e)}`)}
  mark(`${provider} OAuth`,!integrationProblems.some(x=>x.startsWith(`${provider}:`)),runtimeOk?'provider redirect verified':'not ready');
}

const resendSecret=await secretExists('RESEND_API_KEY');
const emailFrom=bindingValue(byName.get('EMAIL_FROM'));
const emailFromSafe=!!emailFrom&&!/example\.invalid|example\.com|REPLACE_WITH/i.test(emailFrom)&&emailFrom.includes('@');
if(!resendSecret)integrationProblems.push('email: RESEND_API_KEY missing');
if(!emailFromSafe)integrationProblems.push('email: EMAIL_FROM missing or placeholder');
mark('password-reset email configuration',resendSecret&&emailFromSafe,resendSecret&&emailFromSafe?'Resend secret + sender present':'not ready');

const inventoryTables=['users','tenants','memberships','operating_locations','employees','daily_employee_reports'];
const countEntries=[];for(const table of inventoryTables)countEntries.push([table,await d1Count(table)]);
const counts=Object.fromEntries(countEntries);
console.log(`INFO production inventory counts users=${counts.users} tenants=${counts.tenants} memberships=${counts.memberships} operating_locations=${counts.operating_locations} employees=${counts.employees} daily_employee_reports=${counts.daily_employee_reports}`);
console.log('INFO destructive sign-up/sign-in/delete lifecycle is exercised in isolated runtime adversarial tests; the live audit deliberately does not create customer/tenant data');
console.log('INFO payments intentionally closed: PAYMENT_PROVIDER=none');
console.log('INFO evidence uploads intentionally closed: EVIDENCE_UPLOADS_ENABLED=false');

if(integrationProblems.length){console.error('LAUNCH_INTEGRATIONS_NOT_READY');for(const problem of integrationProblems)console.error(`- ${problem}`);process.exitCode=2}
else console.log('LAUNCH_INTEGRATIONS_READY Google OAuth + Facebook OAuth + Resend sender configuration present and runtime OAuth starts verified');
