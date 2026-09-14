import crypto from 'node:crypto';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
if(!token||!/^[0-9a-fA-F]{32}$/.test(accountId)||!/^[0-9a-fA-F-]{36}$/.test(databaseId))throw new Error('Cloudflare production audit credentials invalid');
const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
async function query(sql,params=[]){
  const response=await fetch(`${API}/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',headers,body:JSON.stringify({sql,params})});
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false){const code=Array.isArray(body?.errors)?body.errors.map(e=>e?.code).join(','):'';throw new Error(`D1 HTTP ${response.status} code=${code}`)}
  const result=Array.isArray(body?.result)?body.result:[];
  if(!result.length||result.some(x=>x?.success===false))throw new Error(`D1 execution failed for ${sql.slice(0,80)}`);
  return result.flatMap(x=>Array.isArray(x.results)?x.results:[]);
}

const suffix=`${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const tenantId=crypto.randomUUID(),userId=crypto.randomUUID(),email=`d1-registration-${suffix}@example.invalid`,company=`D1 Registration QA ${suffix}`;
const salt=crypto.randomBytes(16).toString('base64'),digest=crypto.randomBytes(32).toString('base64'),ph=`pbkdf2$100000$${salt}$${digest}`;
let error=null;
try{
  await query('INSERT INTO tenants(id,name) VALUES(?,?)',[tenantId,company]);
  console.log('D1_WRITE tenant PASS');
  await query('INSERT INTO users(id,email,display_name,password_hash) VALUES(?,?,?,?)',[userId,email,'qa-registration',ph]);
  console.log('D1_WRITE user PASS');
  await query("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')",[tenantId,userId]);
  console.log('D1_WRITE membership PASS');
  await query("INSERT INTO subscriptions(tenant_id,plan,status,trial_ends_at) VALUES(?,?,'trialing',datetime('now','+14 days'))",[tenantId,'business']);
  console.log('D1_WRITE subscription PASS');
  const state=await query(`SELECT u.id user_id,m.tenant_id,m.role,m.status membership_status,s.plan,s.status subscription_status
    FROM users u JOIN memberships m ON m.user_id=u.id JOIN subscriptions s ON s.tenant_id=m.tenant_id WHERE u.email=?`,[email]);
  if(state.length!==1||state[0].role!=='owner'||state[0].membership_status!=='active'||state[0].subscription_status!=='trialing')throw new Error('isolated D1 registration state invalid');
  console.log('D1_REGISTRATION_WRITE_PROBE_PASS');
}catch(e){error=e;console.error(`D1_REGISTRATION_WRITE_PROBE_FAIL ${String(e?.message||e)}`)}finally{
  try{await query('DELETE FROM tenants WHERE id=?',[tenantId])}catch{}
  try{await query('DELETE FROM users WHERE id=?',[userId])}catch{}
  const u=await query('SELECT count(*) count FROM users WHERE id=? OR email=?',[userId,email]);
  const t=await query('SELECT count(*) count FROM tenants WHERE id=?',[tenantId]);
  console.log(`D1_WRITE cleanup users=${u[0]?.count??'?'} tenants=${t[0]?.count??'?'}`);
  if(Number(u[0]?.count||0)!==0||Number(t[0]?.count||0)!==0){error=error||new Error('D1 write probe cleanup incomplete')}
}
if(error)process.exit(1);
