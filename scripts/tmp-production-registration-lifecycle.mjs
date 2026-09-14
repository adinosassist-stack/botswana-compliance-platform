import crypto from 'node:crypto';

const BASE='https://thebedesk.com';
const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
if(!token)throw new Error('CLOUDFLARE_API_TOKEN missing');
if(!/^[0-9a-fA-F]{32}$/.test(accountId))throw new Error('CLOUDFLARE_ACCOUNT_ID invalid');
if(!/^[0-9a-fA-F-]{36}$/.test(databaseId))throw new Error('D1_DATABASE_ID invalid');

const cfHeaders={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
async function query(sql,params=[]){
  const response=await fetch(`${API}/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',headers:cfHeaders,body:JSON.stringify({sql,params})});
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false)throw new Error(`D1 query failed HTTP ${response.status}`);
  const result=Array.isArray(body?.result)?body.result:[];
  if(!result.length||result.some(x=>x?.success===false))throw new Error(`D1 query execution failed: ${sql.slice(0,100)}`);
  return result.flatMap(x=>Array.isArray(x.results)?x.results:[]);
}
function root(path){const u=new URL('/',BASE);u.searchParams.set('__thebe_api_path',path);return u.toString()}
async function post(path,payload){
  const response=await fetch(root(path),{method:'POST',headers:{accept:'application/json','content-type':'application/json',origin:BASE},body:JSON.stringify(payload),redirect:'manual'});
  const text=await response.text();let body={};try{body=text?JSON.parse(text):{}}catch{body={raw:text.slice(0,240)}}
  return {response,body};
}
function leadingZeroBits(buffer,bits){let remaining=Number(bits)||0;for(const value of buffer){if(remaining<=0)return true;const take=Math.min(8,remaining);if((value>>(8-take))!==0)return false;remaining-=take}return remaining<=0}
async function freshProof(){
  const {response,body}=await post('/api/auth/registration-proof/challenge',{});
  if(response.status!==200||!body?.token)throw new Error(`challenge failed status=${response.status} error=${body?.error||''}`);
  const proofToken=String(body.token),difficulty=Number(body.difficulty||0);
  for(let counter=0;counter<=500000;counter++){
    const digest=crypto.createHash('sha256').update(`${proofToken}:${counter}`).digest();
    if(leadingZeroBits(digest,difficulty))return JSON.stringify({challenge:proofToken,counter,honeypot:''});
  }
  throw new Error('proof solver exceeded counter bound');
}

const suffix=`${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const email=`thebe-registration-${suffix}@example.invalid`;
const companyName=`Thebe Registration QA ${suffix}`;
const password=`Qa-${crypto.randomBytes(18).toString('base64url')}!9`;
let userId='',tenantId='';
let lifecycleError=null;
const before=(await query(`SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM tenants) tenants,(SELECT count(*) FROM memberships) memberships,(SELECT count(*) FROM subscriptions) subscriptions`))[0];
console.log(`REG_LIFECYCLE before users=${before.users} tenants=${before.tenants} memberships=${before.memberships} subscriptions=${before.subscriptions}`);

try{
  const proof=await freshProof();
  const registration=await post('/api/auth/register',{companyName,email,password,plan:'business',turnstileToken:proof});
  const requestId=String(registration.response.headers.get('x-request-id')||registration.body?.requestId||'');
  console.log(`REG_LIFECYCLE register status=${registration.response.status} error=${String(registration.body?.error||'')} requestId=${requestId} message=${String(registration.body?.message||'').slice(0,160)}`);

  // Inspect persistence BEFORE interpreting the HTTP status or running cleanup. This distinguishes
  // a pre-insert failure from a post-commit response/timing failure.
  const users=await query('SELECT id,email FROM users WHERE email=? LIMIT 2',[email]);
  if(users.length){
    userId=String(users[0].id||'');
    const membership=await query(`SELECT m.tenant_id,m.role,m.status,t.name tenant_name,s.plan,s.status subscription_status
      FROM memberships m JOIN tenants t ON t.id=m.tenant_id LEFT JOIN subscriptions s ON s.tenant_id=m.tenant_id
      WHERE m.user_id=? LIMIT 2`,[userId]);
    if(membership.length){
      tenantId=String(membership[0].tenant_id||'');
      console.log(`REG_LIFECYCLE precleanupPersisted=yes role=${membership[0].role} membership=${membership[0].status} plan=${membership[0].plan} subscription=${membership[0].subscription_status}`);
    }else{
      console.log('REG_LIFECYCLE precleanupPersisted=partial user=yes membership=no');
    }
  }else{
    console.log('REG_LIFECYCLE precleanupPersisted=no');
  }

  if(registration.response.status!==202||registration.body?.ok!==true){
    // If a 500 was returned after a committed registration, prove the created credentials work.
    if(userId&&tenantId){
      const recoveryLogin=await post('/api/auth/login',{email,password});
      console.log(`REG_LIFECYCLE loginAfterRegisterError status=${recoveryLogin.response.status} error=${String(recoveryLogin.body?.error||'')} role=${String(recoveryLogin.body?.user?.role||'')}`);
    }
    throw new Error(`registration failed status=${registration.response.status} error=${registration.body?.error||'unknown'}`);
  }

  if(users.length!==1)throw new Error(`expected one synthetic user after registration; found ${users.length}`);
  const membership=await query(`SELECT m.tenant_id,m.role,m.status,t.name tenant_name,s.plan,s.status subscription_status
    FROM memberships m JOIN tenants t ON t.id=m.tenant_id LEFT JOIN subscriptions s ON s.tenant_id=m.tenant_id
    WHERE m.user_id=? LIMIT 2`,[userId]);
  if(membership.length!==1)throw new Error(`expected one membership; found ${membership.length}`);
  tenantId=String(membership[0].tenant_id||'');
  if(membership[0].role!=='owner'||membership[0].status!=='active'||membership[0].subscription_status!=='trialing')throw new Error('registration persisted an invalid owner/subscription state');

  const login=await post('/api/auth/login',{email,password});
  console.log(`REG_LIFECYCLE login status=${login.response.status} error=${String(login.body?.error||'')} role=${String(login.body?.user?.role||'')}`);
  if(login.response.status!==200||login.body?.ok!==true||login.body?.user?.role!=='owner')throw new Error(`new account login failed status=${login.response.status} error=${login.body?.error||'unknown'}`);
  console.log('PRODUCTION_REGISTRATION_LIFECYCLE_PASS');
}catch(error){
  lifecycleError=error;
  console.error(`PRODUCTION_REGISTRATION_LIFECYCLE_FAIL ${String(error?.message||error)}`);
}finally{
  try{
    if(!userId){const rows=await query('SELECT id FROM users WHERE email=? LIMIT 1',[email]);userId=String(rows[0]?.id||'')}
    if(!tenantId&&userId){const rows=await query('SELECT tenant_id FROM memberships WHERE user_id=? LIMIT 1',[userId]);tenantId=String(rows[0]?.tenant_id||'')}
    if(tenantId)await query('DELETE FROM tenants WHERE id=?',[tenantId]);
    if(userId)await query('DELETE FROM users WHERE id=?',[userId]);
    await query('DELETE FROM users WHERE email=?',[email]);
    const residualUsers=await query('SELECT count(*) count FROM users WHERE email=?',[email]);
    const residualTenants=tenantId?await query('SELECT count(*) count FROM tenants WHERE id=?',[tenantId]):[{count:0}];
    const after=(await query(`SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM tenants) tenants,(SELECT count(*) FROM memberships) memberships,(SELECT count(*) FROM subscriptions) subscriptions`))[0];
    console.log(`REG_LIFECYCLE cleanup residualUsers=${residualUsers[0]?.count??'?'} residualTenants=${residualTenants[0]?.count??'?'} after users=${after.users} tenants=${after.tenants} memberships=${after.memberships} subscriptions=${after.subscriptions}`);
    if(Number(residualUsers[0]?.count||0)!==0||Number(residualTenants[0]?.count||0)!==0)throw new Error('synthetic registration cleanup incomplete');
    if(Number(after.users)!==Number(before.users)||Number(after.tenants)!==Number(before.tenants)||Number(after.memberships)!==Number(before.memberships)||Number(after.subscriptions)!==Number(before.subscriptions))throw new Error('production account counts were not restored after synthetic test');
    console.log('PRODUCTION_REGISTRATION_CLEANUP_PASS');
  }catch(cleanupError){
    console.error(`PRODUCTION_REGISTRATION_CLEANUP_FAIL ${String(cleanupError?.message||cleanupError)}`);
    if(!lifecycleError)lifecycleError=cleanupError;
  }
}
if(lifecycleError)process.exit(1);
