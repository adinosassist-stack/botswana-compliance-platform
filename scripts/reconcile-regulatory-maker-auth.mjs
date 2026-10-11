const ORIGIN='https://thebedesk.com';
const RESEND_API='https://api.resend.com';
const RESET_SUBJECT='Reset your Thebe Desk password';

const makerEmail=String(process.env.MAKER_EMAIL||'').trim();
const makerPassword=String(process.env.MAKER_PASSWORD||'');
const resendKey=String(process.env.RESEND_API_KEY||'').trim();
const agent='ThebeDesk-Regulatory-Maker-Auth-Reconcile/1.0';

function fail(message){throw new Error(`Regulatory maker auth reconciliation failed: ${message}`)}
function assert(value,message){if(!value)fail(message)}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function mark(label){console.log(`PASS ${label}`)}
function safeStatus(response){return Number.isInteger(response?.status)?response.status:0}

assert(String(process.env.GITHUB_ACTIONS||'')==='true','refusing to run outside GitHub Actions');
assert(makerEmail.includes('@')&&makerEmail.length<=320,'maker email secret is missing or malformed');
assert(makerPassword.length>=12,'maker password secret is missing or too short');
assert(resendKey.length>=20,'Resend API key is unavailable or too short');

async function appJson(path,{method='POST',body,headers={}}={}){
  const response=await fetch(`${ORIGIN}${path}`,{
    method,
    redirect:'error',
    signal:AbortSignal.timeout(20000),
    headers:{
      'user-agent':agent,
      accept:'application/json',
      ...(body===undefined?{}:{'content-type':'application/json'}),
      origin:ORIGIN,
      'sec-fetch-site':'same-origin',
      ...headers
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await response.text();
  let json=null;
  try{json=text?JSON.parse(text):null}catch{}
  return {response,json};
}

async function resendJson(path){
  const response=await fetch(`${RESEND_API}${path}`,{
    signal:AbortSignal.timeout(20000),
    headers:{authorization:`Bearer ${resendKey}`,accept:'application/json','user-agent':agent}
  });
  const text=await response.text();
  let json=null;
  try{json=text?JSON.parse(text):null}catch{}
  assert(response.ok,`Resend API returned HTTP ${response.status}`);
  return json;
}

function recipients(value){
  if(Array.isArray(value))return value.map(String);
  if(value==null)return [];
  return [String(value)];
}

async function waitForResetToken(startedAt){
  const threshold=startedAt-5000;
  for(let attempt=1;attempt<=30;attempt+=1){
    const listing=await resendJson('/emails?limit=100');
    const items=Array.isArray(listing?.data)?listing.data:[];
    const match=items.find(item=>
      String(item?.subject||'')===RESET_SUBJECT&&
      recipients(item?.to).includes(makerEmail)&&
      Number.isFinite(Date.parse(item?.created_at||''))&&
      Date.parse(item.created_at)>=threshold
    );
    if(match?.id){
      const message=await resendJson(`/emails/${encodeURIComponent(String(match.id))}`);
      const content=[message?.text,message?.html].filter(Boolean).join('\n');
      const linkMatch=content.match(/https:\/\/thebedesk\.com\/reset-password(?:\.html)?#reset_token=([^\s<>"']+)/i);
      assert(linkMatch,'delivered maker reset email did not contain the expected fragment-only reset link');
      const token=decodeURIComponent(linkMatch[1]);
      assert(/^[A-Za-z0-9_-]{40,200}$/.test(token),'maker reset token is malformed');
      return token;
    }
    await sleep(2000);
  }
  fail('maker reset email did not appear in Resend within the bounded polling window');
}

function sessionCookie(response){
  const values=typeof response.headers.getSetCookie==='function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookie=values.map(v=>String(v).split(';',1)[0]).find(v=>v.startsWith('__Host-bw_session='));
  assert(cookie,'maker login did not establish the expected session cookie');
  return cookie;
}

const requestStarted=Date.now();
const request=await appJson('/api/auth/password-reset/request',{body:{email:makerEmail}});
assert(request.response.status===200,`password reset request returned HTTP ${safeStatus(request.response)}`);
mark('maker password-reset request accepted');

const token=await waitForResetToken(requestStarted);
mark('maker reset email retrieved privately');

const completion=await appJson('/api/auth/password-reset/complete',{body:{token,password:makerPassword}});
assert(completion.response.status===200,`password reset completion returned HTTP ${safeStatus(completion.response)}`);
assert(completion.json?.ok===true,'password reset completion did not return ok=true');
mark('maker account password reconciled to existing production secret');

const login=await appJson('/api/auth/login',{body:{email:makerEmail,password:makerPassword}});
assert(login.response.status===200,`maker login still fails after reconciliation (HTTP ${safeStatus(login.response)})`);
assert(login.json?.ok===true,'maker login did not return ok=true after reconciliation');
const cookie=sessionCookie(login.response);
mark('maker login verified with existing production secret');

const status=await appJson('/api/platform/regulatory/status',{method:'GET',headers:{cookie},body:undefined});
assert(status.response.status===200,`platform regulatory status returned HTTP ${safeStatus(status.response)}`);
assert(status.json?.ok===true,'platform regulatory status did not return ok=true');
const role=String(status.json?.role||'');
assert(role==='editor'||role==='admin','maker account is not an editor/admin after reconciliation');
mark('maker editor/admin authority verified');

console.log('Regulatory maker auth reconciliation completed without importing, approving, publishing, or mutating regulatory content.');
