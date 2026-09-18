import crypto from 'node:crypto';

const CF_API='https://api.cloudflare.com/client/v4';
const ORIGIN='https://thebedesk.com';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const auditSecret=String(process.env.AUDIT_INTEGRITY_SECRET||'');
const runId=String(process.env.GITHUB_RUN_ID||Date.now());
const runAttempt=String(process.env.GITHUB_RUN_ATTEMPT||'1');
const nonce=crypto.randomBytes(6).toString('hex');
const email=`synthetic.lifecycle.${runId}.${runAttempt}.${nonce}@example.invalid`;
const companyName=`Thebe Desk Synthetic Lifecycle ${runId}-${runAttempt}-${nonce}`;
const password=`S!${crypto.randomBytes(24).toString('base64url')}9a`;
const agent='ThebeDesk-Synthetic-Lifecycle/1.0';

function fail(message){throw new Error(`Synthetic lifecycle closure failed: ${message}`)}
function assert(condition,message){if(!condition)fail(message)}
function safe(value){return String(value??'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,300)}
function mark(label,detail=''){console.log(`PASS ${label}${detail?`: ${detail}`:''}`)}

assert(token,'CLOUDFLARE_API_TOKEN is empty');
assert(/^[0-9a-fA-F]{32}$/.test(accountId),'CLOUDFLARE_ACCOUNT_ID is invalid');
assert(/^[0-9a-fA-F-]{36}$/.test(databaseId),'D1_DATABASE_ID is invalid');
assert(auditSecret.length>=32,'AUDIT_INTEGRITY_SECRET is unavailable or too short; refusing to create synthetic production data');

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

async function d1(sql,params=[]){
  const body=await cfJson(`/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',body:JSON.stringify({sql:String(sql),params})
  });
  const sets=Array.isArray(body?.result)?body.result:[];
  assert(sets.length&&sets.every(x=>x?.success!==false),`D1 query failed: ${safe(sql)}`);
  return sets[0];
}
async function rows(sql,params=[]){return (await d1(sql,params)).results||[]}
async function one(sql,params=[]){return (await rows(sql,params))[0]||null}
async function count(sql,params=[]){const r=await one(sql,params);const n=Number(r?.count);assert(Number.isFinite(n),`D1 count missing: ${safe(sql)}`);return n}

async function publicJson(path,{method='POST',body={},headers={}}={}){
  const response=await fetch(`${ORIGIN}${path}`,{
    method,redirect:'error',headers:{
      'user-agent':agent,'accept':'application/json','content-type':'application/json','origin':ORIGIN,'sec-fetch-site':'same-origin',...headers
    },body:method==='GET'||method==='HEAD'?undefined:JSON.stringify(body)
  });
  const text=await response.text();
  let json=null;try{json=text?JSON.parse(text):null}catch{}
  return {response,json,text};
}

function leadingZeroBits(hex){
  const bytes=Buffer.from(hex,'hex');let bits=0;
  for(const byte of bytes){if(byte===0){bits+=8;continue}for(let bit=7;bit>=0;bit-=1){if((byte&(1<<bit))===0)bits+=1;else return bits}}
  return bits;
}
async function solveProof(tokenValue,difficulty){
  for(let counter=0;counter<10_000_000;counter+=1){
    const hash=crypto.createHash('sha256').update(`${tokenValue}:${counter}`).digest('hex');
    if(leadingZeroBits(hash)>=difficulty)return {challenge:tokenValue,counter,honeypot:''};
  }
  fail('registration proof search exhausted safety bound');
}
function cookieFrom(response){
  const values=typeof response.headers.getSetCookie==='function'?response.headers.getSetCookie():[response.headers.get('set-cookie')].filter(Boolean);
  const session=values.map(v=>String(v).split(';',1)[0]).find(v=>v.startsWith('__Host-bw_session='));
  assert(session,'login response did not set __Host-bw_session');
  return session;
}
function fingerprint(tenantId){return crypto.createHmac('sha256',auditSecret).update(`tenant-deletion|${tenantId}`).digest('hex')}

let synthetic=null;
let deletionRequestId=null;
let cleanupComplete=false;

async function resolveSynthetic(){
  const matches=await rows(`SELECT u.id AS user_id,u.email,t.id AS tenant_id,t.name AS tenant_name,m.role,m.status
    FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
    WHERE u.email=?`,[email]);
  assert(matches.length<=1,`synthetic email unexpectedly belongs to ${matches.length} memberships`);
  if(!matches.length)return null;
  const r=matches[0];
  assert(r.email===email,'synthetic email mismatch');
  assert(r.tenant_name===companyName,'synthetic company marker mismatch');
  assert(r.role==='owner'&&r.status==='active','synthetic membership is not one active owner membership');
  return {userId:String(r.user_id),tenantId:String(r.tenant_id)};
}

async function guardedCleanup(reason){
  synthetic=synthetic||await resolveSynthetic();
  if(!synthetic){cleanupComplete=true;return}
  const {userId,tenantId}=synthetic;
  const membershipCount=await count('SELECT COUNT(*) AS count FROM memberships WHERE user_id=?',[userId]);
  const tenantMembershipCount=await count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=?',[tenantId]);
  const evidenceCount=await count('SELECT COUNT(*) AS count FROM evidence WHERE tenant_id=?',[tenantId]);
  const legalHoldCount=await count("SELECT COUNT(*) AS count FROM legal_holds WHERE tenant_id=? AND status='active' AND active=1",[tenantId]);
  assert(membershipCount===1&&tenantMembershipCount===1,'cleanup guard refused synthetic identity with unexpected memberships');
  assert(evidenceCount===0,'cleanup guard refused synthetic tenant containing evidence');
  assert(legalHoldCount===0,'cleanup guard refused synthetic tenant with active legal hold');

  if(!deletionRequestId){
    const existing=await one("SELECT id FROM deletion_requests WHERE tenant_id=? ORDER BY requested_at DESC LIMIT 1",[tenantId]);
    deletionRequestId=existing?.id?String(existing.id):`synthetic-${crypto.randomUUID()}`;
  }
  const tombstoneFingerprint=fingerprint(tenantId);
  const existingTombstone=await one('SELECT request_id,tenant_fingerprint FROM deletion_tombstones WHERE tenant_fingerprint=?',[tombstoneFingerprint]);
  if(existingTombstone){
    assert(String(existingTombstone.request_id)===deletionRequestId,'existing tombstone fingerprint belongs to a different request');
  }else{
    await d1(`INSERT INTO deletion_tombstones(request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged,completed_at)
      VALUES(?,?,'v2',0,0,1,CURRENT_TIMESTAMP)`,[deletionRequestId,tombstoneFingerprint]);
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

  assert(await count('SELECT COUNT(*) AS count FROM users WHERE id=? OR email=?',[userId,email])===0,'synthetic user remains after cleanup');
  assert(await count('SELECT COUNT(*) AS count FROM tenants WHERE id=?',[tenantId])===0,'synthetic tenant remains after cleanup');
  assert(await count('SELECT COUNT(*) AS count FROM memberships WHERE tenant_id=? OR user_id=?',[tenantId,userId])===0,'synthetic membership remains after cleanup');
  assert(await count('SELECT COUNT(*) AS count FROM sessions WHERE tenant_id=? OR user_id=?',[tenantId,userId])===0,'synthetic session remains after cleanup');
  const tombstone=await one('SELECT request_id,tenant_fingerprint,purge_version,evidence_records_purged,evidence_objects_purged,orphan_users_purged FROM deletion_tombstones WHERE request_id=?',[deletionRequestId]);
  assert(tombstone&&String(tombstone.tenant_fingerprint)===tombstoneFingerprint,'minimal deletion tombstone missing after cleanup');
  assert(String(tombstone.purge_version)==='v2','tombstone purge version mismatch');
  assert(Number(tombstone.evidence_records_purged)===0&&Number(tombstone.evidence_objects_purged)===0,'unexpected evidence purge count for synthetic tenant');
  cleanupComplete=true;
  mark('synthetic cleanup',`${reason}; tenant/user/session rows removed; non-PII tombstone retained`);
}

try{
  assert(await count('SELECT COUNT(*) AS count FROM users WHERE email=?',[email])===0,'generated synthetic email already exists');
  assert(await count('SELECT COUNT(*) AS count FROM tenants WHERE name=?',[companyName])===0,'generated synthetic company marker already exists');
  mark('cleanup preflight','Cloudflare D1 access + AUDIT_INTEGRITY_SECRET available before write');

  const challenge=await publicJson('/api/auth/registration-proof/challenge',{body:{}});
  assert(challenge.response.status===200,`registration proof challenge HTTP ${challenge.response.status}`);
  const challengeToken=String(challenge.json?.token||'');
  const difficulty=Number(challenge.json?.difficulty);
  assert(challenge.json?.provider==='thebe_proof'&&challenge.json?.required===true&&challenge.json?.action==='register','registration proof contract mismatch');
  assert(challengeToken.length>=80&&challengeToken.includes('.'),'registration proof token malformed');
  assert(Number.isInteger(difficulty)&&difficulty>=8&&difficulty<=16,'registration proof difficulty outside expected range');
  const proof=await solveProof(challengeToken,difficulty);
  mark('registration proof',`solved difficulty=${difficulty}`);

  const registration=await publicJson('/api/auth/register',{body:{email,password,companyName,turnstileToken:JSON.stringify(proof)}});
  assert(registration.response.status===202,`registration HTTP ${registration.response.status}: ${safe(registration.text)}`);
  assert(registration.json?.ok===true,'registration response missing ok=true');
  synthetic=await resolveSynthetic();
  assert(synthetic,'registration returned 202 but synthetic account was not created');
  mark('live registration','202 and unique owner workspace persisted');

  const login=await publicJson('/api/auth/login',{body:{email,password}});
  assert(login.response.status===200,`login HTTP ${login.response.status}: ${safe(login.text)}`);
  assert(login.json?.ok===true,'login response missing ok=true');
  assert(String(login.json?.user?.id||'')===synthetic.userId,'login user id differs from persisted synthetic user');
  assert(String(login.json?.user?.tenantId||'')===synthetic.tenantId,'login tenant id differs from persisted synthetic tenant');
  assert(login.json?.user?.role==='owner','login role is not owner');
  const csrf=String(login.json?.csrfToken||'');
  assert(csrf.length>=16,'login response missing CSRF token');
  const cookie=cookieFrom(login.response);
  mark('live login','200 with owner session cookie + CSRF token');

  const stateProbeController=new AbortController();
  const stateProbeTimer=setTimeout(()=>stateProbeController.abort('synthetic-state-probe-timeout'),8000);
  try{
    const stateProbeUrl=new URL('/',ORIGIN);
    stateProbeUrl.searchParams.set('__thebe_api_path','/api/state');
    const stateProbeResponse=await fetch(stateProbeUrl,{
      method:'GET',
      redirect:'error',
      headers:{'user-agent':agent,'accept':'application/json','origin':ORIGIN,'sec-fetch-site':'same-origin',cookie},
      signal:stateProbeController.signal
    });
    const stateProbeText=await stateProbeResponse.text();
    let stateProbeJson=null;try{stateProbeJson=stateProbeText?JSON.parse(stateProbeText):null}catch{}
    assert(stateProbeResponse.status===200,`authenticated root-tunnel state probe HTTP ${stateProbeResponse.status}: ${safe(stateProbeText)}`);
    assert(Number(stateProbeJson?.version)>=1&&stateProbeJson?.state&&typeof stateProbeJson.state==='object','authenticated root-tunnel state probe returned an invalid workspace payload');
    mark('authenticated root-tunnel state probe',`HTTP 200 version=${stateProbeJson.version}`);
  }catch(error){
    fail(`authenticated root-tunnel state probe failed: ${safe(error?.message||error)}`);
  }finally{
    clearTimeout(stateProbeTimer);
  }

  const browserProof=globalThis.__thebeSyntheticBrowserProof;
  if(typeof browserProof==='function'){
    await browserProof(Object.freeze({email,password,companyName}));
    mark('browser-backed registration continuity','desktop/mobile proof returned control to canonical lifecycle');
  }

  const deletion=await publicJson('/api/account/deletion-request',{
    body:{confirmation:'DELETE MY ACCOUNT',reason:'Automated production synthetic lifecycle closure'},
    headers:{cookie,'x-csrf-token':csrf}
  });
  assert(deletion.response.status===201,`canonical deletion request HTTP ${deletion.response.status}: ${safe(deletion.text)}`);
  assert(deletion.json?.ok===true,'canonical deletion response missing ok=true');
  deletionRequestId=String(deletion.json?.id||'');
  assert(deletionRequestId.length>=8,'canonical deletion response missing request id');
  assert(deletion.json?.status==='requested','synthetic deletion request did not enter requested state');
  const requestRow=await one('SELECT id,status,tenant_id,user_id,requested_by_user_id FROM deletion_requests WHERE id=?',[deletionRequestId]);
  assert(requestRow&&String(requestRow.tenant_id)===synthetic.tenantId,'persisted deletion request tenant mismatch');
  assert(String(requestRow.user_id)===synthetic.userId&&String(requestRow.requested_by_user_id)===synthetic.userId,'persisted deletion request user mismatch');
  assert(requestRow.status==='requested','persisted deletion request status mismatch');
  mark('canonical deletion request','owner-authenticated request persisted as requested');

  await guardedCleanup('canonical lifecycle proof completed');
  mark('production synthetic lifecycle closure','registration -> login -> deletion request -> purge verified');
}catch(error){
  console.error(`FAIL ${safe(error?.message||error)}`);
  try{if(!cleanupComplete)await guardedCleanup('failure recovery')}catch(cleanupError){console.error(`FAIL cleanup recovery: ${safe(cleanupError?.message||cleanupError)}`)}
  throw error;
}
