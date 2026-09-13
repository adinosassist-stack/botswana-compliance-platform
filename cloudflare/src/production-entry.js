import worker from "./worker.js";

const TURNSTILE_ORIGIN="https://challenges.cloudflare.com";
const TURNSTILE_VERIFY_URL=`${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;
const LEGACY_TURNSTILE_CONFIGURATION_ERROR="turnstile_configuration_error";
const META_CSP_RE=/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'])[^>]*>/i;
const ICON_LINK_RE=/<link\b(?=[^>]*\brel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'])[^>]*>\s*/gi;
const THEBE_LOGO_FAVICON="/assets/thebe-desk-favicon-512.png?v=20260912b";
const OWNER_COMMAND_CENTRE_RELEASE="20260913a";
const TURNSTILE_SECRET_HEALTH_TTL_MS=5*60*1000;
const REGISTRATION_PROOF_TTL_MS=5*60*1000;
const REGISTRATION_PROOF_DIFFICULTY=10;
const REGISTRATION_PROOF_MAX_COUNTER=500000;
const REGISTRATION_CHALLENGE_WINDOW_MS=5*60*1000;
const REGISTRATION_CHALLENGE_LIMIT=30;
let turnstileSecretHealthCache={checkedAt:0,result:null};
const usedRegistrationProofs=new Map();
const registrationChallengeBudget=new Map();

const FIRST_PARTY_CLIENT_BLOCK=String.raw`
let turnstileWidgetId=null,turnstileToken="",turnstileConfig=null,turnstileLoadPromise=null,turnstileExecutionResolve=null,turnstileExecutionReject=null;
function loadTurnstileScript(){return Promise.resolve(null)}
function settleTurnstileExecution(token,error=null){turnstileToken=String(token||"");if(error)throw error;return turnstileToken}
function registrationProofLeadingZeroBits(bytes,bits){
 let remaining=Number(bits)||0;
 for(const value of bytes){
  if(remaining<=0)return true;
  const take=Math.min(8,remaining);
  if((value>>(8-take))!==0)return false;
  remaining-=take;
 }
 return remaining<=0
}
async function ensureRegistrationChallenge(){
 if(STANDALONE_PREVIEW)return;
 const field=document.getElementById("turnstileField");
 if(field)field.hidden=true;
 if(authMode!=="register"){turnstileToken="";turnstileConfig=null;return}
 turnstileConfig={required:true,provider:"thebe_proof",action:"register"};
 if(field&&!document.getElementById("registrationWebsite")){
  const trap=document.createElement("input");
  trap.id="registrationWebsite";
  trap.name="website";
  trap.type="text";
  trap.tabIndex=-1;
  trap.autocomplete="off";
  trap.setAttribute("aria-hidden","true");
  trap.style.position="absolute";
  trap.style.left="-10000px";
  trap.style.width="1px";
  trap.style.height="1px";
  trap.style.opacity="0";
  field.appendChild(trap)
 }
}
async function freshRegistrationTurnstileToken(){
 await ensureRegistrationChallenge();
 const challenge=await productionApiClient.request("/api/auth/registration-proof/challenge",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:"{}"
 });
 const token=String(challenge?.token||"");
 const difficulty=Number(challenge?.difficulty||0);
 if(!token||difficulty<8||difficulty>16)throw new Error("Registration protection is not ready. Try again.");
 const encoder=new TextEncoder();
 for(let counter=0;counter<500000;counter++){
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(token+":"+counter)));
  if(registrationProofLeadingZeroBits(digest,difficulty)){
   turnstileToken=JSON.stringify({
    challenge:token,
    counter,
    honeypot:String(document.getElementById("registrationWebsite")?.value||"")
   });
   return turnstileToken
  }
  if(counter>0&&counter%512===0)await new Promise(resolve=>setTimeout(resolve,0))
 }
 throw new Error("Registration protection took too long. Click Create account again.")
}
`;

function turnstileCspReady(headers){
  const csp=String(headers?.get?.("content-security-policy")||"");
  return csp.includes(TURNSTILE_ORIGIN)&&csp.includes(`frame-src ${TURNSTILE_ORIGIN}`);
}

function stripConflictingMetaCsp(html){
  return String(html||"").replace(META_CSP_RE,"");
}

function injectLogoFavicon(html){
  const source=String(html||"");
  if(!/<\/head>/i.test(source))return source;
  const withoutOldIcons=source.replace(ICON_LINK_RE,"");
  const faviconMarkup=`<link rel="icon" type="image/png" sizes="512x512" href="${THEBE_LOGO_FAVICON}" />\n<link rel="apple-touch-icon" href="${THEBE_LOGO_FAVICON}" />\n`;
  return withoutOldIcons.replace(/<\/head>/i,`${faviconMarkup}</head>`);
}

function injectOwnerCommandCentreAssets(html){
  let source=String(html||"");
  if(!/<\/head>/i.test(source)||!/<\/body>/i.test(source))return source;
  const cssHref=`/assets/owner-command-centre.css?v=${OWNER_COMMAND_CENTRE_RELEASE}`;
  const jsSrc=`/js/owner-command-centre.js?v=${OWNER_COMMAND_CENTRE_RELEASE}`;
  if(!source.includes("/assets/owner-command-centre.css"))source=source.replace(/<\/head>/i,`<link rel="stylesheet" href="${cssHref}" />\n</head>`);
  if(!source.includes("/js/owner-command-centre.js"))source=source.replace(/<\/body>/i,`<script src="${jsSrc}" defer></script>\n</body>`);
  return source;
}

function injectFirstPartyRegistrationClient(html){
  const source=String(html||"");
  const start=source.indexOf("let turnstileWidgetId=");
  if(start<0)return source;
  const end=source.indexOf("function clearWorkspaceChoice(){",start);
  if(end<0)return source;
  return source.slice(0,start)+FIRST_PARTY_CLIENT_BLOCK+"\n"+source.slice(end);
}

function logicalRequestPath(request){
  try{
    const url=new URL(request.url);
    if(url.pathname==="/"){
      const tunneled=url.searchParams.get("__thebe_api_path");
      if(tunneled)return String(tunneled);
    }
    if(url.pathname.startsWith("/__thebe_api/"))return `/api/${url.pathname.slice("/__thebe_api/".length)}`;
    if(url.pathname==="/__thebe_api")return "/api";
    return url.pathname;
  }catch{return ""}
}

function isRegistrationRequest(request){
  return String(request?.method||"").toUpperCase()==="POST"&&logicalRequestPath(request)==="/api/auth/register";
}

function isRegistrationProofChallengeRequest(request){
  return String(request?.method||"").toUpperCase()==="POST"&&logicalRequestPath(request)==="/api/auth/registration-proof/challenge";
}

function jsonResponse(data,status,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
}

function base64UrlEncodeText(value){
  const bytes=new TextEncoder().encode(String(value));
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}

function base64UrlDecodeText(value){
  const raw=String(value||"").replaceAll("-","+").replaceAll("_","/");
  const padded=raw+"=".repeat((4-raw.length%4)%4);
  const binary=atob(padded);
  const bytes=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function timingSafeText(a,b){
  const left=String(a||""),right=String(b||"");
  if(left.length!==right.length)return false;
  let diff=0;
  for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i);
  return diff===0;
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

function registrationProofSecret(env){
  const value=String(env?.AUTOMATION_SECRET||env?.SESSION_SECRET||"").trim();
  return value.length>=32?value:"";
}

function registrationOriginAllowed(request,env){
  const origin=String(request.headers.get("origin")||"").trim();
  if(!origin)return true;
  try{
    const configured=new URL(String(env?.PUBLIC_ORIGIN||env?.PUBLIC_APP_URL||""));
    return new URL(origin).origin===configured.origin;
  }catch{return false}
}

function registrationClientIp(request){
  return String(request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"").split(",")[0].trim();
}

function pruneChallengeState(now=Date.now()){
  for(const [key,value] of usedRegistrationProofs)if(Number(value)<=now)usedRegistrationProofs.delete(key);
  for(const [key,value] of registrationChallengeBudget){
    const recent=(Array.isArray(value)?value:[]).filter(ts=>now-Number(ts)<REGISTRATION_CHALLENGE_WINDOW_MS);
    if(recent.length)registrationChallengeBudget.set(key,recent);else registrationChallengeBudget.delete(key);
  }
}

function allowChallengeIssue(request){
  const ip=registrationClientIp(request);
  if(!ip)return true;
  const now=Date.now();
  pruneChallengeState(now);
  const recent=registrationChallengeBudget.get(ip)||[];
  if(recent.length>=REGISTRATION_CHALLENGE_LIMIT)return false;
  recent.push(now);
  registrationChallengeBudget.set(ip,recent);
  return true;
}

async function createRegistrationProofChallenge(request,env){
  if(!registrationOriginAllowed(request,env))return jsonResponse({error:"origin_failed"},403);
  if(!allowChallengeIssue(request))return jsonResponse({error:"rate_limited",message:"Too many registration protection requests. Try again shortly."},429,{"retry-after":"60"});
  const secret=registrationProofSecret(env);
  if(!secret)return jsonResponse({error:"registration_protection_unavailable",message:"Registration protection is temporarily unavailable."},503,{"retry-after":"60"});
  const now=Date.now(),bytes=crypto.getRandomValues(new Uint8Array(18));
  let nonce="";
  for(const byte of bytes)nonce+=byte.toString(16).padStart(2,"0");
  const ip=registrationClientIp(request);
  const ipTag=(await hmacHex(secret,`registration-ip:${ip||"unknown"}`)).slice(0,24);
  const payload={v:1,n:nonce,iat:now,exp:now+REGISTRATION_PROOF_TTL_MS,b:REGISTRATION_PROOF_DIFFICULTY,ip:ipTag};
  const encoded=base64UrlEncodeText(JSON.stringify(payload));
  const signature=await hmacHex(secret,`registration-challenge:${encoded}`);
  return jsonResponse({provider:"thebe_proof",required:true,action:"register",token:`${encoded}.${signature}`,difficulty:REGISTRATION_PROOF_DIFFICULTY,expiresInSeconds:Math.floor(REGISTRATION_PROOF_TTL_MS/1000)},200);
}

async function verifyRegistrationProof(request,env,serialized){
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
  pruneChallengeState(now);
  if(usedRegistrationProofs.has(payload.n))return {ok:false,reason:"proof_replayed"};
  const digest=await sha256Bytes(`${challenge}:${counter}`);
  if(!hasLeadingZeroBits(digest,payload.b))return {ok:false,reason:"work_invalid"};
  usedRegistrationProofs.set(payload.n,payload.exp);
  return {ok:true,reason:"verified"};
}

async function turnstileSecretHealth(env){
  const secret=String(env?.TURNSTILE_SECRET_KEY||"").trim();
  if(secret.length<20)return {ok:false,reason:"secret_missing_or_weak"};
  const now=Date.now();
  if(turnstileSecretHealthCache.result&&now-turnstileSecretHealthCache.checkedAt<TURNSTILE_SECRET_HEALTH_TTL_MS)return turnstileSecretHealthCache.result;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort("turnstile_secret_health_timeout"),5000);
  try{
    const body=new URLSearchParams({secret});
    const response=await fetch(TURNSTILE_VERIFY_URL,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body,signal:controller.signal,redirect:"error"});
    if(!response.ok)return {ok:null,reason:`siteverify_http_${response.status}`};
    const result=await response.json();
    const errors=Array.isArray(result?.["error-codes"])?result["error-codes"].map(String):[];
    const health=errors.includes("invalid-input-secret")||errors.includes("missing-input-secret")
      ?{ok:false,reason:LEGACY_TURNSTILE_CONFIGURATION_ERROR}
      :errors.includes("missing-input-response")
        ?{ok:true,reason:"secret_accepted"}
        :{ok:null,reason:errors[0]||"siteverify_unexpected_response"};
    if(health.ok!==null)turnstileSecretHealthCache={checkedAt:now,result:health};
    return health;
  }catch{return {ok:null,reason:"siteverify_unavailable"}}
  finally{clearTimeout(timer)}
}

async function rewriteRegistrationVerificationFailure(response){
  if(response.status!==403)return response;
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("application/json"))return response;
  try{
    const data=await response.clone().json();
    if(data?.error!=="human_verification_failed")return response;
    const headers=new Headers(response.headers);headers.set("cache-control","no-store");
    return new Response(JSON.stringify({
      error:"human_verification_retry",
      message:"Human verification was rejected. If this repeats after a fresh challenge, confirm the Turnstile site key and secret key come from the same widget and that thebedesk.com is an allowed hostname.",
      retryable:true
    }),{status:403,statusText:response.statusText,headers});
  }catch{return response}
}

async function fetchWithTurnstileCspRepair(request,env,ctx){
  if(isRegistrationProofChallengeRequest(request))return createRegistrationProofChallenge(request,env);

  const registrationRequest=isRegistrationRequest(request);
  if(registrationRequest){
    let body={};
    try{body=await request.clone().json()}catch{}
    const proof=await verifyRegistrationProof(request,env,body?.turnstileToken);
    if(!proof.ok){
      return jsonResponse({
        error:"registration_protection_failed",
        message:"Registration protection expired or could not be verified. Click Create account again to generate a fresh secure proof.",
        retryable:true
      },403);
    }
    const verifiedEnv=Object.assign({},env,{APP_ENV:"registration-proof-verified",TURNSTILE_SECRET_KEY:""});
    return worker.fetch(request,verifiedEnv,ctx);
  }

  let response=await worker.fetch(request,env,ctx);
  if(request.method!=="GET")return response;
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("text/html"))return response;
  const html=await response.clone().text();
  const repaired=injectOwnerCommandCentreAssets(injectFirstPartyRegistrationClient(injectLogoFavicon(stripConflictingMetaCsp(html))));
  if(repaired===html)return response;
  const headers=new Headers(response.headers);
  headers.set("x-thebe-csp-meta","server-header-authoritative");
  headers.set("x-thebe-favicon","optimized-512");
  headers.set("x-thebe-registration-protection","first-party-proof-v1");
  headers.set("x-thebe-owner-brief",OWNER_COMMAND_CENTRE_RELEASE);
  return new Response(repaired,{status:response.status,statusText:response.statusText,headers});
}

export {
  createRegistrationProofChallenge,
  injectFirstPartyRegistrationClient,
  injectLogoFavicon,
  injectOwnerCommandCentreAssets,
  isRegistrationRequest,
  isRegistrationProofChallengeRequest,
  rewriteRegistrationVerificationFailure,
  stripConflictingMetaCsp,
  turnstileCspReady,
  turnstileSecretHealth,
  verifyRegistrationProof
};

export default {
  fetch:fetchWithTurnstileCspRepair,
  async scheduled(event,env,ctx){
    return worker.scheduled(event,env,ctx);
  }
};