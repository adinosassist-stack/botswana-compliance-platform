import worker from "./worker.js";

const TURNSTILE_ORIGIN="https://challenges.cloudflare.com";
const TURNSTILE_VERIFY_URL=`${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;
const META_CSP_RE=/<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']Content-Security-Policy["'])[^>]*>/i;
const ICON_LINK_RE=/<link\b(?=[^>]*\brel\s*=\s*["'](?:icon|shortcut icon|apple-touch-icon)["'])[^>]*>\s*/gi;
const THEBE_LOGO_FAVICON="/assets/thebe-desk-favicon-512.png?v=20260912b";
const TURNSTILE_SECRET_HEALTH_TTL_MS=5*60*1000;
let turnstileSecretHealthCache={checkedAt:0,result:null};

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

function isRegistrationRequest(request){
  if(String(request?.method||"").toUpperCase()!=="POST")return false;
  try{
    const url=new URL(request.url);
    if(url.pathname==="/api/auth/register"||url.pathname==="/__thebe_api/auth/register")return true;
    return url.pathname==="/"&&url.searchParams.get("__thebe_api_path")==="/api/auth/register";
  }catch{return false}
}

function jsonResponse(data,status,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
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
      ?{ok:false,reason:"secret_rejected"}
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
  const registrationRequest=isRegistrationRequest(request);
  if(registrationRequest){
    const health=await turnstileSecretHealth(env);
    if(health.ok===false){
      return jsonResponse({
        error:"turnstile_configuration_error",
        message:"Human verification is temporarily unavailable because the verification key configuration needs attention."
      },503,{"retry-after":"60"});
    }
  }

  let response=await worker.fetch(request,env,ctx);
  if(registrationRequest)response=await rewriteRegistrationVerificationFailure(response);
  if(request.method!=="GET")return response;
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("text/html")||!turnstileCspReady(response.headers))return response;
  const html=await response.clone().text();
  const repaired=injectLogoFavicon(stripConflictingMetaCsp(html));
  if(repaired===html)return response;
  const headers=new Headers(response.headers);
  headers.set("x-thebe-csp-meta","server-header-authoritative");
  headers.set("x-thebe-favicon","optimized-512");
  return new Response(repaired,{status:response.status,statusText:response.statusText,headers});
}

export {injectLogoFavicon,isRegistrationRequest,rewriteRegistrationVerificationFailure,stripConflictingMetaCsp,turnstileCspReady,turnstileSecretHealth};

export default {
  fetch:fetchWithTurnstileCspRepair,
  async scheduled(event,env,ctx){
    return worker.scheduled(event,env,ctx);
  }
};
