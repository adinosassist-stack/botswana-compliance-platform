const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3100';
const email=`launch-test-${Date.now()}@example.com`;
const password='LaunchCandidate-Strong-Password-123!';
async function jsonFetch(path,opts={}){const r=await fetch(base+path,opts);let d={};try{d=await r.json()}catch{}return {r,d}}
async function registerAndLogin({email,password,companyName}){
  let {r:reg,d:registration}=await jsonFetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,companyName})});
  if(reg.status!==202)throw new Error(`register failed ${reg.status} ${JSON.stringify(registration)}`);
  if(reg.headers.get('set-cookie'))throw new Error('registration must not create an authenticated session');
  let {r:login,d:auth}=await jsonFetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(login.status!==200)throw new Error(`login failed ${login.status} ${JSON.stringify(auth)}`);
  const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
  if(!cookie||!auth.csrfToken)throw new Error('missing session cookie/csrf after login');
  return {cookie,csrfToken:auth.csrfToken,user:auth.user};
}

const first=await registerAndLogin({email,password,companyName:'Launch Test Company'});
const cookie=first.cookie;
const headers={'Content-Type':'application/json','X-CSRF-Token':first.csrfToken,'Cookie':cookie};
let {r:me,d:meData}=await jsonFetch('/api/auth/me',{headers:{Cookie:cookie}});if(me.status!==200||!meData?.user)throw new Error('auth/me failed');
let {r:billing,d:bd}=await jsonFetch('/api/billing/status',{headers:{Cookie:cookie}});if(billing.status!==200||bd.status!=='trialing')throw new Error('new tenant trial entitlement missing');

let {r:get,d:gd}=await jsonFetch('/api/state',{headers:{Cookie:cookie}});if(get.status!==200||!gd.version)throw new Error('state get failed');
const state={activeCompanyId:'co_test',activeRole:'owner',companies:[{id:'co_test',profile:{name:'Test'}}],audit:[]};
let {r:put,d:pd}=await jsonFetch('/api/state',{method:'PUT',headers,body:JSON.stringify({state,version:gd.version})});if(put.status!==200||pd.version<=gd.version)throw new Error('state update/version failed');
let {r:stale}=await jsonFetch('/api/state',{method:'PUT',headers,body:JSON.stringify({state,version:gd.version})});if(stale.status!==409)throw new Error(`stale write should be 409, got ${stale.status}`);

const email2=`launch-test-two-${Date.now()}@example.com`;
const second=await registerAndLogin({email:email2,password,companyName:'Second Tenant Company'});
const cookie2=second.cookie;
let {r:get2,d:gd2}=await jsonFetch('/api/state',{headers:{Cookie:cookie2}});if(get2.status!==200)throw new Error('second tenant state failed');
if(JSON.stringify(gd2.state).includes('Launch Test Company')||JSON.stringify(gd2.state).includes('co_test'))throw new Error('tenant state isolation failed');
const secondState={activeCompanyId:'co_second',activeRole:'owner',companies:[{id:'co_second',profile:{name:'Second Tenant'}}],audit:[]};
const headers2={'Content-Type':'application/json','X-CSRF-Token':second.csrfToken,'Cookie':cookie2};
let {r:put2}=await jsonFetch('/api/state',{method:'PUT',headers:headers2,body:JSON.stringify({state:secondState,version:gd2.version})});if(put2.status!==200)throw new Error('second tenant update failed');
let {r:get1again,d:g1}=await jsonFetch('/api/state',{headers:{Cookie:cookie}});if(get1again.status!==200||JSON.stringify(g1.state).includes('Second Tenant'))throw new Error('cross-tenant workspace bleed detected');

let {r:audit}=await jsonFetch('/api/audit',{headers:{Cookie:cookie}});if(audit.status!==200)throw new Error('audit read failed');
let {r:logout}=await jsonFetch('/api/auth/logout',{method:'POST',headers,body:'{}'});if(logout.status!==200)throw new Error('logout failed');
let {r:afterLogout}=await jsonFetch('/api/auth/me',{headers:{Cookie:cookie}});if(afterLogout.status!==401)throw new Error(`revoked session should be unauthorized after logout, got ${afterLogout.status}`);
console.log('API integration test passed: register -> login -> CSRF/session -> trial -> workspace versioning -> tenant isolation -> audit -> logout');
