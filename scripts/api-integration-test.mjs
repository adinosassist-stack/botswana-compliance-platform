const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3100';
const email=`launch-test-${Date.now()}@example.com`;
const password='LaunchCandidate-Strong-Password-123!';
async function jsonFetch(path,opts={}){const r=await fetch(base+path,opts);let d={};try{d=await r.json()}catch{}return {r,d}}
let {r:reg,d:rd}=await jsonFetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,companyName:'Launch Test Company'})});
if(reg.status!==201)throw new Error(`register failed ${reg.status} ${JSON.stringify(rd)}`);
const cookie=(reg.headers.get('set-cookie')||'').split(';')[0];
if(!cookie||!rd.csrfToken)throw new Error('missing session cookie/csrf');
const headers={'Content-Type':'application/json','X-CSRF-Token':rd.csrfToken,'Cookie':cookie};
let {r:me}=await jsonFetch('/api/auth/me',{headers:{Cookie:cookie}});if(me.status!==200)throw new Error('auth/me failed');
let {r:billing,d:bd}=await jsonFetch('/api/billing/status',{headers:{Cookie:cookie}});if(billing.status!==200||bd.status!=='trialing')throw new Error('new tenant trial entitlement missing');

let {r:get,d:gd}=await jsonFetch('/api/state',{headers:{Cookie:cookie}});if(get.status!==200||!gd.version)throw new Error('state get failed');
const state={activeCompanyId:'co_test',activeRole:'owner',companies:[{id:'co_test',profile:{name:'Test'}}],audit:[]};
let {r:put,d:pd}=await jsonFetch('/api/state',{method:'PUT',headers,body:JSON.stringify({state,version:gd.version})});if(put.status!==200||pd.version<=gd.version)throw new Error('state update/version failed');
let {r:stale}=await jsonFetch('/api/state',{method:'PUT',headers,body:JSON.stringify({state,version:gd.version})});if(stale.status!==409)throw new Error(`stale write should be 409, got ${stale.status}`);
const email2=`launch-test-two-${Date.now()}@example.com`;
let {r:reg2,d:rd2}=await jsonFetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email2,password,companyName:'Second Tenant Company'})});
if(reg2.status!==201)throw new Error(`second register failed ${reg2.status}`);
const cookie2=(reg2.headers.get('set-cookie')||'').split(';')[0];
let {r:get2,d:gd2}=await jsonFetch('/api/state',{headers:{Cookie:cookie2}});if(get2.status!==200)throw new Error('second tenant state failed');
if(JSON.stringify(gd2.state).includes('Launch Test Company')||JSON.stringify(gd2.state).includes('co_test'))throw new Error('tenant state isolation failed');
const secondState={activeCompanyId:'co_second',activeRole:'owner',companies:[{id:'co_second',profile:{name:'Second Tenant'}}],audit:[]};
let headers2={'Content-Type':'application/json','X-CSRF-Token':rd2.csrfToken,'Cookie':cookie2};
let {r:put2}=await jsonFetch('/api/state',{method:'PUT',headers:headers2,body:JSON.stringify({state:secondState,version:gd2.version})});if(put2.status!==200)throw new Error('second tenant update failed');
let {r:get1again,d:g1}=await jsonFetch('/api/state',{headers:{Cookie:cookie}});if(get1again.status!==200||JSON.stringify(g1.state).includes('Second Tenant'))throw new Error('cross-tenant workspace bleed detected');

let {r:audit}=await jsonFetch('/api/audit',{headers:{Cookie:cookie}});if(audit.status!==200)throw new Error('audit read failed');
let {r:logout}=await jsonFetch('/api/auth/logout',{method:'POST',headers,body:'{}'});if(logout.status!==200)throw new Error('logout failed');
console.log('API integration test passed');
