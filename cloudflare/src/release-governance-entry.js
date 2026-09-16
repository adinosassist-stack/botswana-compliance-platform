import base from "./agentic-entry.js";
import releaseMetadata from "../../release/production.json" with {type:"json"};

const VALID_REGISTRATION_MODES=new Set(["hold","cohort","open"]);
const OAUTH_VISIBILITY_SCRIPT="/js/oauth-availability.js?v=20260916b";
const SYNTHETIC_EMAIL_RE=/^synthetic\.lifecycle\.\d+\.\d+\.[0-9a-f]{12}@example\.invalid$/;
const MAX_REGISTRATION_POLICY_BODY_BYTES=16*1024;

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers
  }});
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

function registrationMode(env){
  const configured=String(env?.REGISTRATION_MODE||"hold").trim().toLowerCase();
  return VALID_REGISTRATION_MODES.has(configured)?configured:"invalid";
}

function registrationCohort(env){
  return new Set(String(env?.REGISTRATION_COHORT_EMAILS||"")
    .split(",")
    .map(value=>value.trim().toLowerCase())
    .filter(Boolean));
}

function oauthProviders(env){
  const google=!!(
    String(env?.GOOGLE_OAUTH_CLIENT_ID||"").trim()&&
    String(env?.GOOGLE_OAUTH_CLIENT_SECRET||"").trim()&&
    String(env?.GOOGLE_OAUTH_REDIRECT_URI||"").trim()
  );
  const facebook=!!(
    String(env?.FACEBOOK_APP_ID||"").trim()&&
    String(env?.FACEBOOK_APP_SECRET||"").trim()&&
    String(env?.FACEBOOK_OAUTH_REDIRECT_URI||"").trim()
  );
  return {google,facebook};
}

function releaseProvenance(env){
  return {
    version:String(env?.APP_RELEASE||"v78.1.21.101"),
    release:String(releaseMetadata?.release||"production"),
    releaseSequence:Number(releaseMetadata?.sequence||0),
    sourceSha:String(releaseMetadata?.sourceSha||""),
    runtimeEntry:"release-governance-entry",
    registrationMode:registrationMode(env)
  };
}

function timingSafeText(left,right){
  const a=String(left||""),b=String(right||"");
  if(a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

async function hmacHex(secret,value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function signedSyntheticRegistrationAllowed(request,env,email){
  if(!SYNTHETIC_EMAIL_RE.test(email))return false;
  const secret=String(env?.AUDIT_INTEGRITY_SECRET||"");
  if(secret.length<32)return false;
  const supplied=String(request.headers.get("x-thebe-registration-audit")||"").trim().toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(supplied))return false;
  const expected=await hmacHex(secret,`registration-override:${email}`);
  return timingSafeText(supplied,expected);
}

async function readJsonBoundedClone(request,maxBytes=MAX_REGISTRATION_POLICY_BODY_BYTES){
  const clone=request.clone();
  const declared=Number(clone.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>maxBytes)return {body:{},tooLarge:true};
  if(!clone.body)return {body:{},tooLarge:false};
  const reader=clone.body.getReader(),chunks=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value)continue;
      total+=value.byteLength;
      if(total>maxBytes){
        try{await reader.cancel("payload_too_large")}catch{}
        return {body:{},tooLarge:true};
      }
      chunks.push(value);
    }
  }finally{try{reader.releaseLock()}catch{}}
  if(!chunks.length)return {body:{},tooLarge:false};
  const merged=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}
  try{return {body:JSON.parse(new TextDecoder().decode(merged)),tooLarge:false}}
  catch{return {body:{},tooLarge:false}}
}

function registrationHoldResponse(mode="hold"){
  return json({error:"registration_on_hold",message:"New customer activation is temporarily on hold while launch verification is completed.",registrationMode:mode},503,{"retry-after":"300"});
}

async function registrationGate(request,env){
  const mode=registrationMode(env);
  if(mode==="invalid")return json({error:"registration_policy_invalid",message:"Registration is unavailable while the activation policy is being repaired."},503,{"retry-after":"300"});
  if(mode==="open")return null;

  const hasAuditOverride=!!String(request.headers.get("x-thebe-registration-audit")||"").trim();
  if(mode==="hold"&&!hasAuditOverride)return registrationHoldResponse(mode);

  const parsed=await readJsonBoundedClone(request);
  if(parsed.tooLarge)return json({error:"payload_too_large",message:"Registration request body is too large."},413);
  const email=String(parsed.body?.email||"").trim().toLowerCase();
  if(await signedSyntheticRegistrationAllowed(request,env,email))return null;

  if(mode==="hold")return registrationHoldResponse(mode);
  const cohort=registrationCohort(env);
  if(email&&cohort.has(email))return null;
  return json({error:"registration_not_in_cohort",message:"Registration is currently limited to the approved launch cohort.",registrationMode:mode},403);
}

function injectOauthAvailabilityScript(html){
  const source=String(html||"");
  if(!source.toLowerCase().includes("</body>")||source.includes("/js/oauth-availability.js"))return source;
  const tag=`<script src="${OAUTH_VISIBILITY_SCRIPT}" defer></script>\n`;
  const index=source.toLowerCase().lastIndexOf("</body>");
  return source.slice(0,index)+tag+source.slice(index);
}

async function decorateResponse(request,env,response){
  const path=logicalRequestPath(request);
  let next=response;
  if(request.method==="GET"&&path==="/api/ready"){
    try{
      const body=await response.clone().json();
      const headers=new Headers(response.headers);
      headers.delete("content-length");
      headers.set("content-type","application/json; charset=utf-8");
      headers.set("cache-control","no-store");
      next=new Response(JSON.stringify({
        ...body,
        provenance:releaseProvenance(env),
        oauthProviders:oauthProviders(env)
      }),{status:response.status,statusText:response.statusText,headers});
    }catch{}
  }

  if(request.method==="GET"){
    const type=String(next.headers.get("content-type")||"").toLowerCase();
    if(type.includes("text/html")){
      try{
        const html=await next.clone().text();
        const injected=injectOauthAvailabilityScript(html);
        if(injected!==html){
          const headers=new Headers(next.headers);
          headers.delete("content-length");
          headers.delete("etag");
          headers.set("x-thebe-oauth-ui","availability-gated-v2");
          next=new Response(injected,{status:next.status,statusText:next.statusText,headers});
        }
      }catch{}
    }
  }

  const headers=new Headers(next.headers);
  const provenance=releaseProvenance(env);
  if(provenance.sourceSha)headers.set("x-thebe-source-sha",provenance.sourceSha);
  if(provenance.releaseSequence>0)headers.set("x-thebe-release-sequence",String(provenance.releaseSequence));
  headers.set("x-thebe-registration-mode",provenance.registrationMode);
  return new Response(next.body,{status:next.status,statusText:next.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const path=logicalRequestPath(request);
    if(request.method==="GET"&&path==="/api/version")return json({ok:true,...releaseProvenance(env)});
    if(request.method==="GET"&&path==="/api/auth/oauth/providers")return json({ok:true,...oauthProviders(env)});
    if(request.method==="GET"&&path==="/api/auth/registration-policy")return json({ok:true,mode:registrationMode(env)});
    if(request.method==="POST"&&path==="/api/auth/register"){
      const blocked=await registrationGate(request,env);
      if(blocked)return decorateResponse(request,env,blocked);
    }
    const response=await base.fetch(request,env,ctx);
    return decorateResponse(request,env,response);
  },
  async scheduled(event,env,ctx){
    return base.scheduled(event,env,ctx);
  }
};

export {
  injectOauthAvailabilityScript,
  logicalRequestPath,
  oauthProviders,
  readJsonBoundedClone,
  registrationCohort,
  registrationGate,
  registrationMode,
  releaseProvenance,
  signedSyntheticRegistrationAllowed
};
