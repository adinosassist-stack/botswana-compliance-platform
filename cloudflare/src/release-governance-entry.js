import base from "./agentic-entry.js";
import releaseMetadata from "../../release/production.json";

const VALID_REGISTRATION_MODES=new Set(["hold","cohort","open"]);
const OAUTH_VISIBILITY_SCRIPT="/js/oauth-availability.js?v=20260916a";

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

async function registrationGate(request,env){
  const mode=registrationMode(env);
  if(mode==="invalid")return json({error:"registration_policy_invalid",message:"Registration is unavailable while the activation policy is being repaired."},503,{"retry-after":"300"});
  if(mode==="hold")return json({error:"registration_on_hold",message:"New customer activation is temporarily on hold while launch verification is completed.",registrationMode:mode},503,{"retry-after":"300"});
  if(mode==="open")return null;

  let body={};
  try{body=await request.clone().json()}catch{}
  const email=String(body?.email||"").trim().toLowerCase();
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
          headers.set("x-thebe-oauth-ui","availability-gated-v1");
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
  registrationCohort,
  registrationGate,
  registrationMode,
  releaseProvenance
};
