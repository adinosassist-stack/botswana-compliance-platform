const REGISTRATION_PROOF_TTL_MS=5*60*1000;
const REGISTRATION_PROOF_MAX_COUNTER=500000;
const REGISTRATION_CHALLENGE_WINDOW_MS=5*60*1000;
const REGISTRATION_CHALLENGE_LIMIT=30;

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers
  }});
}

function registrationProofSecret(env){
  const value=String(env?.AUTOMATION_SECRET||env?.SESSION_SECRET||"").trim();
  return value.length>=32?value:"";
}

function registrationClientIp(request){
  return String(request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"").split(",")[0].trim();
}

async function hmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function timingSafeText(left,right){
  const a=String(left||""),b=String(right||"");
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function base64UrlDecodeText(value){
  const raw=String(value||"").replaceAll("-","+").replaceAll("_","/");
  const padded=raw+"=".repeat((4-raw.length%4)%4);
  const binary=atob(padded);
  const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sha256Bytes(value){
  return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value))));
}

function hasLeadingZeroBits(bytes,bits){
  let remaining=Number(bits)||0;
  for(const value of bytes){
    if(remaining<=0)return true;
    const take=Math.min(8,remaining);
    if((value>>(8-take))!==0)return false;
    remaining-=take;
  }
  return remaining<=0;
}

async function consumeDurableRegistrationBudget(env,scope,material,{limit,windowMs}){
  const secret=registrationProofSecret(env);
  if(!secret||!env?.DB)return {ok:false,unavailable:true,retryAfter:60};
  const now=Date.now();
  const bucket=Math.floor(now/windowMs);
  const keyHash=await hmacHex(secret+"|registration-boundary-rate-v1",`${scope}|${bucket}|${String(material||"unknown")}`);
  const expiresAt=new Date((bucket+2)*windowMs).toISOString();
  try{
    await env.DB.prepare(`INSERT INTO auth_rate_limits(key_hash,scope,count,window_start,expires_at)
      VALUES(?,?,1,?,?)
      ON CONFLICT(key_hash) DO UPDATE SET count=auth_rate_limits.count+1`)
      .bind(keyHash,scope,bucket,expiresAt).run();
    const row=await env.DB.prepare("SELECT count FROM auth_rate_limits WHERE key_hash=? LIMIT 1").bind(keyHash).first();
    const count=Number(row?.count||0);
    return {
      ok:count>0&&count<=limit,
      unavailable:false,
      retryAfter:Math.max(1,Math.ceil((((bucket+1)*windowMs)-now)/1000))
    };
  }catch{
    return {ok:false,unavailable:true,retryAfter:60};
  }
}

async function durableRegistrationChallengeGate(request,env){
  const budget=await consumeDurableRegistrationBudget(
    env,
    "registration_proof_challenge_ip",
    registrationClientIp(request)||"unknown",
    {limit:REGISTRATION_CHALLENGE_LIMIT,windowMs:REGISTRATION_CHALLENGE_WINDOW_MS}
  );
  if(budget.unavailable){
    return json({error:"registration_protection_unavailable",message:"Registration protection is temporarily unavailable."},503,{"retry-after":String(budget.retryAfter)});
  }
  if(!budget.ok){
    return json({error:"rate_limited",message:"Too many registration protection requests. Try again shortly."},429,{"retry-after":String(budget.retryAfter)});
  }
  return null;
}

async function claimRegistrationNonce(env,secret,nonce,expiresAtMs){
  if(!env?.DB)return {ok:false,reason:"replay_ledger_unavailable"};
  const keyHash=await hmacHex(secret+"|registration-boundary-replay-v1",String(nonce));
  const expiresAt=new Date(Number(expiresAtMs)).toISOString();
  try{
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO auth_rate_limits(key_hash,scope,count,window_start,expires_at)
      VALUES(?,?,1,?,?)`)
      .bind(keyHash,"registration_proof_replay",Date.now(),expiresAt).run();
    const changes=Number(result?.meta?.changes??result?.changes??0);
    if(changes===1)return {ok:true,reason:"claimed"};
    if(changes===0)return {ok:false,reason:"proof_replayed"};
    return {ok:false,reason:"replay_ledger_unavailable"};
  }catch{
    return {ok:false,reason:"replay_ledger_unavailable"};
  }
}

async function validateAndClaimRegistrationProof(request,env,serialized){
  const secret=registrationProofSecret(env);
  if(!secret)return {ok:false,reason:"secret_unavailable"};
  let proof;
  try{proof=JSON.parse(String(serialized||""))}catch{return {ok:false,reason:"proof_malformed"}}
  if(String(proof?.honeypot||"").trim())return {ok:false,reason:"honeypot"};
  const challenge=String(proof?.challenge||"");
  const counter=Number(proof?.counter);
  if(!challenge||!Number.isSafeInteger(counter)||counter<0||counter>REGISTRATION_PROOF_MAX_COUNTER)return {ok:false,reason:"proof_invalid"};
  const split=challenge.lastIndexOf(".");
  if(split<=0)return {ok:false,reason:"challenge_malformed"};
  const encoded=challenge.slice(0,split),signature=challenge.slice(split+1);
  const expectedSignature=await hmacHex(secret,`registration-challenge:${encoded}`);
  if(!timingSafeText(signature,expectedSignature))return {ok:false,reason:"signature_invalid"};
  let payload;
  try{payload=JSON.parse(base64UrlDecodeText(encoded))}catch{return {ok:false,reason:"payload_invalid"}}
  const now=Date.now();
  if(payload?.v!==1||typeof payload?.n!=="string"||payload.n.length<20)return {ok:false,reason:"payload_invalid"};
  if(!Number.isFinite(payload?.iat)||!Number.isFinite(payload?.exp)||payload.exp<=now||payload.iat>now+30_000||payload.exp-payload.iat>REGISTRATION_PROOF_TTL_MS+5_000)return {ok:false,reason:"challenge_expired"};
  if(!Number.isInteger(payload?.b)||payload.b<8||payload.b>16)return {ok:false,reason:"difficulty_invalid"};
  const ip=registrationClientIp(request);
  const expectedIpTag=(await hmacHex(secret,`registration-ip:${ip||"unknown"}`)).slice(0,24);
  if(!timingSafeText(String(payload.ip||""),expectedIpTag))return {ok:false,reason:"client_changed"};
  const digest=await sha256Bytes(`${challenge}:${counter}`);
  if(!hasLeadingZeroBits(digest,payload.b))return {ok:false,reason:"work_invalid"};
  const claim=await claimRegistrationNonce(env,secret,payload.n,payload.exp);
  if(!claim.ok)return claim;
  return {ok:true,reason:"verified_and_claimed"};
}

export {
  claimRegistrationNonce,
  consumeDurableRegistrationBudget,
  durableRegistrationChallengeGate,
  registrationClientIp,
  registrationProofSecret,
  validateAndClaimRegistrationProof
};
