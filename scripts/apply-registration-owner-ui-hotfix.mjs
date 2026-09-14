import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const write=(p,v)=>fs.writeFileSync(p,v);
function replaceOne(source,needle,replacement,label){
  const first=source.indexOf(needle);
  if(first<0)throw new Error(`missing patch target: ${label}`);
  if(source.indexOf(needle,first+needle.length)>=0)throw new Error(`ambiguous patch target: ${label}`);
  return source.slice(0,first)+replacement+source.slice(first+needle.length);
}
function replaceRegexOne(source,re,replacement,label){
  const matches=[...source.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];
  if(matches.length!==1)throw new Error(`${label}: expected 1 match, got ${matches.length}`);
  return source.replace(re,replacement);
}

// 1) Cloudflare-compatible password hashing. Keep stronger legacy hashes readable,
// but never attempt to upgrade a working 100k hash to a work factor the production
// Worker cannot safely derive.
{
  const p='cloudflare/src/worker.js';
  let s=read(p);
  s=replaceOne(s,
    'const PASSWORD_PBKDF2_ITERATIONS=120000;',
    'const PASSWORD_PBKDF2_ITERATIONS=100000;',
    'PBKDF2 production work factor');
  s=replaceOne(s,
    'function passwordNeedsRehash(stored){const parsed=parsePasswordHash(stored);return !!parsed&&parsed.iterations!==PASSWORD_PBKDF2_ITERATIONS}',
    'function passwordNeedsRehash(stored){const parsed=parsePasswordHash(stored);return !!parsed&&parsed.iterations<PASSWORD_PBKDF2_ITERATIONS}',
    'PBKDF2 no-downgrade rehash policy');
  write(p,s);
}

// 2) Keep the historical password gate aligned with the production-compatible baseline.
{
  const p='tests/v78-12150-resilience-backup-rate-limit-adversarial.mjs';
  let s=read(p);
  s=replaceOne(s,
`const valid=__v782150Test.parsePasswordHash("pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=");
ok(valid?.iterations===120000&&!__v782150Test.passwordNeedsRehash("pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk="),"current PBKDF2 hashes must parse without forced rehash");
ok(__v782150Test.passwordNeedsRehash("pbkdf2$100000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk="),"older accepted PBKDF2 work factors must be marked for upgrade");`,
`const valid=__v782150Test.parsePasswordHash("pbkdf2$100000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=");
ok(valid?.iterations===100000&&!__v782150Test.passwordNeedsRehash("pbkdf2$100000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk="),"current production-compatible PBKDF2 hashes must parse without forced rehash");
const stronger=__v782150Test.parsePasswordHash("pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=");
ok(stronger?.iterations===120000&&!__v782150Test.passwordNeedsRehash("pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk="),"stronger accepted PBKDF2 hashes must never be downgraded");`,
    'historical PBKDF2 expectations');
  write(p,s);
}

// 3) Improve registration error copy and make the direct registration route verify
// account usability by signing in immediately after the 202 registration response.
{
  const p='public/js/api-client.js';
  let s=read(p);
  s=replaceOne(s,
    'human_verification_failed:"Human verification failed or expired. Complete the verification and try again.",database_daily_limit_reached:',
    'human_verification_failed:"Human verification failed or expired. Complete the verification and try again.",registration_protection_failed:"Registration protection expired or could not be verified. Click Create account again to generate a fresh secure proof.",database_daily_limit_reached:',
    'registration proof friendly error');
  write(p,s);
}
{
  const p='public/js/register-direct.js';
  let s=read(p);
  s=replaceOne(s,
`  await api("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyName,email,password,turnstileToken:proof})});
  setStatus("Account request accepted. Return to Thebe Desk and sign in with this email.","good");
  btn.textContent="Account created";
  setTimeout(()=>{location.href="/"},1800);`,
`  await api("/api/auth/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyName,email,password,turnstileToken:proof})});
  btn.textContent="Signing in…";
  try{
   await api("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
   setStatus("Account created. Opening your workspace…","good");
   location.href="/";
   return;
  }catch(loginError){
   setStatus("Account created. Continue to Thebe Desk and sign in with this email.","good");
   btn.textContent="Continue to sign in";
   setTimeout(()=>{location.href="/"},1400);
  }`,
    'direct registration success/login flow');
  write(p,s);
}

// 4) Platform-admin owner UI: customer owners already get every customer screen.
// Platform specialist screens become navigable only after the server-side platform
// status endpoint has positively authenticated the principal. No tenant/company name
// grants privilege.
{
  const p='public/index.html';
  let s=read(p);
  s=replaceOne(s,
    'let currentUser=null;\nlet authMode="login";',
    'let currentUser=null;\nlet platformRegulatoryAccess=false;\nlet authMode="login";',
    'platform access state');
  s=replaceOne(s,
` const allCustomer=[...document.querySelectorAll('.nav button[data-view]:not(.platformRegulatoryOnly)')].map(b=>b.dataset.view);
 if(r==="owner")return new Set(allCustomer);`,
` const allCustomer=[...document.querySelectorAll('.nav button[data-view]:not(.platformRegulatoryOnly)')].map(b=>b.dataset.view);
 const platformAdminViews=platformRegulatoryAccess?[...document.querySelectorAll('.nav button.platformRegulatoryOnly[data-view]')].map(b=>b.dataset.view):[];
 if(r==="owner")return new Set([...allCustomer,...platformAdminViews]);`,
    'owner platform view matrix');
  s=replaceOne(s,
    '<details class="nav-specialist-tools">',
    '<details class="nav-specialist-tools" hidden>',
    'hide specialist tools by default');
  s=replaceOne(s,
    '@media(max-width:960px){.nav-access-group>summary,.nav-specialist-tools>summary',
    '.nav-specialist-tools[hidden]{display:none!important}\n@media(max-width:960px){.nav-access-group>summary,.nav-specialist-tools>summary',
    'specialist hidden CSS');
  s=replaceRegexOne(s,
    /async function renderPlatformRegulatoryGovernance\(\)\{let status=null;try\{status=await apiJson\("\/api\/platform\/regulatory\/status"\)\}catch\(e\)\{document\.querySelectorAll\("\.platformRegulatoryOnly"\)\.forEach\(x=>x\.style\.display="none"\);return\}document\.querySelectorAll\("\.platformRegulatoryOnly"\)\.forEach\(x=>x\.style\.display=""\);renderFoundationPackStatus\(\);/,
    'async function renderPlatformRegulatoryGovernance(){let status=null;try{status=await apiJson("/api/platform/regulatory/status")}catch(e){platformRegulatoryAccess=false;document.querySelectorAll(".platformRegulatoryOnly").forEach(x=>x.style.display="none");document.querySelector(".nav-specialist-tools")?.setAttribute("hidden","");applyRoleUi();return}platformRegulatoryAccess=status?.role==="admin";document.querySelectorAll(".platformRegulatoryOnly").forEach(x=>x.style.display=platformRegulatoryAccess?"":"none");const specialist=document.querySelector(".nav-specialist-tools");if(specialist){if(platformRegulatoryAccess)specialist.removeAttribute("hidden");else specialist.setAttribute("hidden","")}applyRoleUi();renderFoundationPackStatus();',
    'platform governance UI state');
  s=replaceOne(s,
    'async function logoutUser(){try{',
    'async function logoutUser(){platformRegulatoryAccess=false;try{',
    'clear platform access on logout');
  write(p,s);
}

// 5) Force service-worker shell refresh for the fixed API client/UI.
{
  const p='public/sw.js';
  let s=read(p);
  s=replaceRegexOne(s,/const CACHE="[^"]+";/,'const CACHE="thebe-desk-recovery-r1-bw-business-protection-v78-1.21.101-registration-owner-ui-hotfix-20260914";','service worker cache release');
  write(p,s);
}

// 6) Add a focused regression and wire it into release regressions.
{
  const test=`import fs from 'node:fs';\nimport assert from 'node:assert/strict';\nimport {__v782150Test} from '../cloudflare/src/worker.js';\n\nconst read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');\nconst worker=read('cloudflare/src/worker.js');\nconst html=read('public/index.html');\nconst api=read('public/js/api-client.js');\nconst direct=read('public/js/register-direct.js');\nconst sw=read('public/sw.js');\nlet checks=0;const ok=(name,value)=>{assert.ok(value,name);checks++};\n\nok('production PBKDF2 work factor is Worker-compatible',worker.includes('const PASSWORD_PBKDF2_ITERATIONS=100000;'));\nok('rehash policy upgrades only weaker hashes and never downgrades stronger ones',worker.includes('parsed.iterations<PASSWORD_PBKDF2_ITERATIONS'));\nconst current='pbkdf2$100000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';\nconst stronger='pbkdf2$120000$i2iHNd1usm2v00FvnFVQrw==$IKniLUpx7tDt1h8eYCqRmLd/m1OcYh+mQbe+Xncc1Wk=';\nok('current hash remains current',__v782150Test.parsePasswordHash(current)?.iterations===100000&&!__v782150Test.passwordNeedsRehash(current));\nok('stronger accepted hash is not downgraded',__v782150Test.parsePasswordHash(stronger)?.iterations===120000&&!__v782150Test.passwordNeedsRehash(stronger));\nok('registration still creates an owner membership',worker.includes("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')"));\nok('registration keeps IP global and account throttles',worker.includes('register-ip')&&worker.includes('register-platform')&&worker.includes('register-account'));\nok('first-party registration protection remains fail closed',direct.includes('/api/auth/registration-proof/challenge')&&direct.includes('turnstileToken:proof'));\nok('direct registration verifies usability by logging in after creation',direct.includes('btn.textContent="Signing in…"')&&direct.includes('await api("/api/auth/login"'));\nok('registration protection error is user-readable',api.includes('registration_protection_failed:"Registration protection expired'));\nok('platform specialist tools start hidden',html.includes('<details class="nav-specialist-tools" hidden>')&&html.includes('.nav-specialist-tools[hidden]{display:none!important}'));\nok('owner platform screens require positive platform-admin status',html.includes('let platformRegulatoryAccess=false')&&html.includes('platformRegulatoryAccess=status?.role==="admin"'));\nok('owner view matrix conditionally includes platform-only buttons',html.includes('const platformAdminViews=platformRegulatoryAccess?')&&html.includes('new Set([...allCustomer,...platformAdminViews])'));\nok('logout clears platform UI privilege',html.includes('async function logoutUser(){platformRegulatoryAccess=false;'));\nok('no company-name privilege shortcut was introduced',!html.includes('Lovely Group')&&!html.includes('Lovey Group')&&!worker.includes('Lovely Group')&&!worker.includes('Lovey Group'));\nok('service worker cache is rotated for fixed UI/runtime assets',sw.includes('registration-owner-ui-hotfix-20260914'));\nconsole.log(\`V82 registration/owner/navigation hardening: \${checks}/\${checks} PASS\`);\n`;
  write('tests/v82-registration-owner-navigation-hardening.mjs',test);
  const p='package.json';
  const pkg=JSON.parse(read(p));
  const command='node tests/v82-registration-owner-navigation-hardening.mjs';
  if(!String(pkg.scripts['test:release-regressions']||'').includes(command))pkg.scripts['test:release-regressions']=`${command} && ${pkg.scripts['test:release-regressions']}`;
  write(p,JSON.stringify(pkg,null,2)+'\n');
}

console.log('registration/owner/navigation hotfix applied');
