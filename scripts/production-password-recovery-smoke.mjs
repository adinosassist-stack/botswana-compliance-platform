import crypto from 'node:crypto';

const ORIGIN='https://thebedesk.com';
const CF_API='https://api.cloudflare.com/client/v4';
const RESEND_API='https://api.resend.com';
const TEST_EMAIL='delivered@resend.dev';
const RESET_SUBJECT='Reset your Thebe Desk password';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const auditSecret=String(process.env.AUDIT_INTEGRITY_SECRET||'');
const resendKey=String(process.env.RESEND_API_KEY||'').trim();
const runId=String(process.env.GITHUB_RUN_ID||Date.now());
const attempt=String(process.env.GITHUB_RUN_ATTEMPT||'1');
const nonce=crypto.randomBytes(6).toString('hex');
const companyName=`Thebe Desk Recovery Smoke ${runId}-${attempt}-${nonce}`;
const initialPassword=`R!${crypto.randomBytes(24).toString('base64url')}9a`;
const newPassword=`N!${crypto.randomBytes(24).toString('base64url')}8b`;
const agent='ThebeDesk-Production-Recovery-Smoke/1.0';

function fail(message){throw new Error(`Production password recovery smoke failed: ${message}`)}
function assert(value,message){if(!value)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,240)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(auditSecret.length>=32,'AUDIT_INTEGRITY_SECRET is unavailable or too short');
assert(resendKey.length>=20,'RESEND_API_KEY is unavailable or too short');
assert(String(process.env.GITHUB_ACTIONS||'')==='true','refusing to run outside GitHub Actions');

const cfHeaders={authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json'};
const resendHeaders={authorization:`Bearer ${resendKey}`,accept:'application/json'};

async function cfJson(path,options={}){
  const response=await fetch(`${CF_API}${path}`,{...options,headers:{...cfHeaders,...(options.headers||{})}});
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(x=>`${x?.code??'unknown'}:${x?.message??'unknown'}`).join(' | '):safe(text);
    fail(`Cloudflare API ${path} HTTP ${response.status}: ${errors}`);
  }
  return body;
}
async function d1(sql,params=[]){
  const body=await cfJson(`/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',body:JSON.stringify({sql:String(sql),params})});
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`D1 query failed: ${safe(sql)}`);
  return sets[0];
}
async function rows(sql,params=[]){return (await d1(sql,params)).results||[]}
async function one(sql,params=[]){return (await rows(sql,params))[0]||null}
async function count(sql,params=[]){const row=await one(sql,params);const n=Number(row?.count);assert(Number.isFinite(n),`D1 count missing: ${safe(sql)}`);return n}

async function publicJson(path,{method='POST',body={},headers={}}={}){
  const response=await fetch(`${ORIGIN}${path}`,{
    method,redirect:'error',headers:{'user-agent':agent,accept:'application/json','content-type':'application/json',origin:ORIGIN,'sec-fetch-site':'same-origin',...headers},
    body:method==='GET'||method==='HEAD'?undefined:JSON.stringify(body)
  });
  const text=await response.text();let json=null;try{json=text?JSON.parse(text):null}catch{}
  return {response,json,text};
}
function leadingZeroBits(hex){
  const bytes=Buffer.from(hex,'hex');let bits=0;
  for(const byte of bytes){if(byte===0){bits+=8;continue}for(let bit=7;bit>=0;bit-=1){if((byte&(1<<bit))===0)bits+=1;else return bits}}
  return bits;
}
async function solveProof(challenge,difficulty){
  for(let counter=0;counter<10_000_000;counter+=1){
    const hash=crypto.createHash('sha256').update(`${challenge}:${counter}`).digest('hex');
    if(leadingZeroBits(hash)>=difficulty)return {challenge,counter,honeypot:''};
  }
  fail('registration proof search exhausted safety bound');
}
function cookieFrom(response){
  const values=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean);
  const session=values.map(v=>String(v).split(';',1)[0]).find(v=>v.startsWith('__Host-bw_session='));
  assert(session,'login response did not set __Host-bw_session');return session;
}
function fingerprint(tenantId){return crypto.createHmac('sha256',auditSecret).update(`tenant-deletion|${tenantId}`).digest('hex')}

let synthetic=null;
let deletionRequestId=null;
let cleanupComplete=false;

async function resolveSynthetic(){
  const matches=await rows(`SELECT u.id AS user_id,u.email,t.id AS tenant_id,t.name AS tenant_name,m.role,m.status
    FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
    WHERE u.email=?`,[TEST_EMAIL]);
  assert(matches.length<=1,`test address unexpectedly belongs to ${matches.length} memberships`);
  if(!matches.length)return null;
  const row=matches[0];
  assert(row.email===TEST_EMAIL,'synthetic email mismatch');
  assert(row.tenant_name===companyName,'refusing to own or delete a pre-existing account at the Resend test address');
  assert(row.role==='owner'&&row.status==='active','synthetic membership is not one active owner membership');
  return {userId:String(row.user_id),tenantId:String(row.tenant_id)};
}

async function guardedCleanup(reason){
  synthetic=synthetic||await resolveSynthetic();
  if(!synthetic){cleanupComplete=true;return}
  const {userId,tenantId}=synthetic;
  assert(await count('SELECT COUNT(*) AS count FROM memberships WHERE user_id=?',[userId])===1,'cleanup refused user with unexpected memberships');
  assert(await count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=?',[tenantId])===1,'cleanup refused tenant with unexpected memberships');
  assert(await count('SELECT COUNT(*) AS count FROM evidence WHERE tenant_id=?',[tenantId])===0,'cleanup refused tenant containing evidence');
  assert(await count("SELECT COUNT(*) AS count FROM legal_holds WHERE tenant_id=? AND status='active' AND active=1",[tenantId])===0,'cleanup refused tenant with active legal hold');

  if(!deletionRequestId){
    const existing=await one('SELECT id FROM deletion_requests WHERE tenant_id=? ORDER BY requested_at DESC LIMIT 1',[tenantId]);
    deletionRequestId=existing?.id?String(existing.id):`recovery-smoke-${crypto.randomUUID()}`;
  }
  const fp=fingerprint(tenantId);
  const existingTombstone=await one('SELECT request_id,tenant_fingerprint FROM deletion_tombstones WHERE tenant_fingerprint=?',[fp]);
  if(existingTombstone){
    assert(String(existingTombstone.request_id)===deletionRequestId,'existing deletion tombstone belongs to a different request');
  }else{
    await d1(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged,completed_at)
      VALUES(?,?,'v2',0,0,1,CURRENT_TIMESTAMP)`,[deletionRequestId,fp]);
  }
  const nonCascade=[
    ['DELETE FROM audit_events WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM ai_usage WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM payment_return_events WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM payment_integrity_anomalies WHERE tenant_id=?',[tenantId]],
    ['DELETE FROM partner_task_events WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_tasks WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_access_events WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_clients WHERE partner_tenant_id=? OR client_tenant_id=?',[tenantId,tenantId]],
    ['DELETE FROM partner_invites WHERE partner_tenant_id=? OR accepted_client_tenant_id=?',[tenantId,tenantId]]
  ];
  for(const [sql,params] of nonCascade)await d1(sql,params);
  await d1('DELETE FROM tenants WHERE id=?',[tenantId]);
  await d1('DELETE FROM users WHERE id=? AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id=?)',[userId,userId]);
  assert(await count('SELECT COUNT(*) AS count FROM users WHERE id=? OR email=?',[userId,TEST_EMAIL])===0,'synthetic user remains after cleanup');
  assert(await count('SELECT COUNT(*) AS count FROM tenants WHERE id=?',[tenantId])===0,'synthetic tenant remains after cleanup');
  cleanupComplete=true;
  mark('synthetic cleanup',`${reason}; only uniquely marked recovery-smoke identity purged`);
}

async function resendJson(path){
  const response=await fetch(`${RESEND_API}${path}`,{headers:resendHeaders});
  const text=await response.text();let json=null;try{json=text?JSON.parse(text):null}catch{}
  assert(response.ok,`Resend ${path} HTTP ${response.status}: ${safe(text)}`);return json;
}

async function waitForResetEmail(startedAt){
  const threshold=startedAt-5000;
  for(let attemptNo=1;attemptNo<=30;attemptNo+=1){
    const listing=await resendJson('/emails?limit=100');
    const items=Array.isArray(listing?.data)?listing.data:[];
    const match=items.find(item=>
      String(item?.subject||'')===RESET_SUBJECT&&
      Array.isArray(item?.to)&&item.to.map(String).includes(TEST_EMAIL)&&
      Number.isFinite(Date.parse(item?.created_at||''))&&Date.parse(item.created_at)>=threshold
    );
    if(match?.id){
      const message=await resendJson(`/emails/${encodeURIComponent(String(match.id))}`);
      const content=[message?.text,message?.html].filter(Boolean).join('\n');
      const linkMatch=content.match(/https:\/\/thebedesk\.com\/reset-password\.html#reset_token=([^\s<>"']+)/i);
      assert(linkMatch,'delivered reset email does not target /reset-password.html with a fragment-only token');
      const raw=decodeURIComponent(linkMatch[1]);
      assert(/^[A-Za-z0-9_-]{40,200}$/.test(raw),'delivered reset token is malformed');
      return raw;
    }
    await sleep(2000);
  }
  fail('reset email did not appear in Resend sent-email API within the bounded polling window');
}

try{
  assert(await count('SELECT COUNT(*) AS count FROM users WHERE email=?',[TEST_EMAIL])===0,'Resend test address already exists in production; refusing collision');
  assert(await count('SELECT COUNT(*) AS count FROM tenants WHERE name=?',[companyName])===0,'generated recovery-smoke company marker already exists');
  mark('preflight','production D1 + Resend observability available and test address unowned');

  const challenge=await publicJson('/api/auth/registration-proof/challenge',{body:{}});
  assert(challenge.response.status===200,`registration challenge HTTP ${challenge.response.status}`);
  const challengeToken=String(challenge.json?.token||''),difficulty=Number(challenge.json?.difficulty);
  assert(challenge.json?.provider==='thebe_proof'&&challenge.json?.required===true&&challenge.json?.action==='register','registration proof contract mismatch');
  assert(challengeToken.length>=80&&challengeToken.includes('.'),'registration proof token malformed');
  assert(Number.isInteger(difficulty)&&difficulty>=8&&difficulty<=16,'registration proof difficulty outside expected range');
  const proof=await solveProof(challengeToken,difficulty);

  const registration=await publicJson('/api/auth/register',{body:{email:TEST_EMAIL,password:initialPassword,companyName,turnstileToken:JSON.stringify(proof)}});
  assert(registration.response.status===202,`registration HTTP ${registration.response.status}: ${safe(registration.text)}`);
  synthetic=await resolveSynthetic();assert(synthetic,'synthetic account was not persisted');
  mark('synthetic registration','unique owner workspace created through public production endpoint');

  const requestStarted=Date.now();
  const request=await publicJson('/api/auth/password-reset/request',{body:{email:TEST_EMAIL}});
  assert(request.response.status===200,`password reset request HTTP ${request.response.status}: ${safe(request.text)}`);
  const resetToken=await waitForResetEmail(requestStarted);
  mark('real reset delivery','Resend message retrieved privately; reset link path and fragment contract verified');

  const resetPage=await fetch(`${ORIGIN}/reset-password.html`,{redirect:'error',headers:{'user-agent':agent}});
  assert(resetPage.status===200,'reset-password.html is not publicly reachable');

  const completion=await publicJson('/api/auth/password-reset/complete',{body:{token:resetToken,password:newPassword}});
  assert(completion.response.status===200,`password reset complete HTTP ${completion.response.status}: ${safe(completion.text)}`);
  assert(completion.json?.ok===true,'password reset completion missing ok=true');
  mark('reset consumption','single delivered token changed password through production API');

  const oldLogin=await publicJson('/api/auth/login',{body:{email:TEST_EMAIL,password:initialPassword}});
  assert(oldLogin.response.status===401,'old password still authenticates after password reset');
  const login=await publicJson('/api/auth/login',{body:{email:TEST_EMAIL,password:newPassword}});
  assert(login.response.status===200&&login.json?.ok===true,'new password does not authenticate');
  assert(String(login.json?.user?.id||'')===synthetic.userId&&String(login.json?.user?.tenantId||'')===synthetic.tenantId,'login identity differs from synthetic production record');
  const csrf=String(login.json?.csrfToken||'');assert(csrf.length>=16,'login response missing CSRF token');
  const cookie=cookieFrom(login.response);
  mark('post-reset login','old password rejected; new password opened the same owner workspace');

  const deletion=await publicJson('/api/account/deletion-request',{body:{confirmation:'DELETE MY ACCOUNT',reason:'Automated production password recovery smoke closure'},headers:{cookie,'x-csrf-token':csrf}});
  assert(deletion.response.status===201&&deletion.json?.ok===true,`canonical deletion request HTTP ${deletion.response.status}: ${safe(deletion.text)}`);
  deletionRequestId=String(deletion.json?.id||'');assert(deletionRequestId.length>=8,'deletion request missing id');
  await guardedCleanup('password recovery round-trip completed');
  mark('production password recovery','request -> delivered email -> reset page -> completion -> login -> purge verified');
}catch(error){
  try{await guardedCleanup('failure cleanup')}catch(cleanupError){console.error(`ERROR cleanup also failed: ${safe(cleanupError?.message||cleanupError)}`)}
  throw error;
}finally{
  assert(cleanupComplete,'synthetic cleanup did not complete');
}
