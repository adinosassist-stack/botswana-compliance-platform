import releaseMetadata from "../../release/production.json" with {type:"json"};

const EVENT_PATH="/api/marketing/conversion-event";
const REGISTER_PATH="/api/auth/register";
const COOKIE_NAME="thebe_cv";
const PUBLIC_TENANT="public-market";
const CLIENT_EVENTS=new Set(["market_view","cta_click","registration_view","registration_submit"]);
const VALID_SOURCES=new Set(["market","hero","nav","product","pricing","mobile-sticky","final","unknown"]);
const VALID_PLANS=new Set(["","starter","business","pro","network","partner","monitor","protect","control"]);
const ID_RE=/^[a-zA-Z0-9_-]{16,64}$/;
const MAX_BODY_BYTES=2048;

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    ...headers
  }});
}
function validId(value){return ID_RE.test(String(value||""))}
function safeText(value,max=80){return String(value||"").trim().slice(0,max)}
function releaseSequence(){return Number(releaseMetadata?.sequence||0)}
function cookieValue(request,name){
  const raw=String(request.headers.get("cookie")||"");
  for(const part of raw.split(";")){
    const [key,...rest]=part.trim().split("=");
    if(key===name){try{return decodeURIComponent(rest.join("="))}catch{return rest.join("=")}}
  }
  return "";
}
function conversionIdFromRequest(request){const value=cookieValue(request,COOKIE_NAME);return validId(value)?value:""}
function sameOrigin(request){
  try{
    const url=new URL(request.url),origin=String(request.headers.get("origin")||"");
    return origin===url.origin;
  }catch{return false}
}
async function publicRateAllowed(request,env,conversionId){
  if(!env?.PUBLIC_RATE_LIMITER||typeof env.PUBLIC_RATE_LIMITER.limit!=="function")return true;
  const transientIp=safeText(request.headers.get("cf-connecting-ip")||"",80);
  const key=`conversion:${transientIp||conversionId}`;
  try{const result=await env.PUBLIC_RATE_LIMITER.limit({key});return result?.success!==false}catch{return false}
}
async function readEventBody(request){
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new Error("payload_too_large");
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>MAX_BODY_BYTES)throw new Error("payload_too_large");
  try{return JSON.parse(text||"{}")}catch{throw new Error("invalid_json")}
}
function eventType(stage){return `MARKETING_${String(stage||"").toUpperCase()}`}
async function recordEvent(env,{conversionId,stage,source="unknown",plan="",path=""}){
  if(!env?.DB||!validId(conversionId))return false;
  const normalizedSource=VALID_SOURCES.has(source)?source:"unknown";
  const normalizedPlan=VALID_PLANS.has(plan)?plan:"";
  const normalizedPath=safeText(path,120);
  const type=eventType(stage);
  const data=JSON.stringify({stage,source:normalizedSource,plan:normalizedPlan,path:normalizedPath,releaseSequence:releaseSequence()});
  try{
    await env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data,occurred_at)
      SELECT ?,NULL,?,'conversion',?,?,CURRENT_TIMESTAMP
      WHERE NOT EXISTS(
        SELECT 1 FROM audit_events WHERE tenant_id=? AND entity_type='conversion' AND entity_id=? AND event_type=? LIMIT 1
      )`).bind(PUBLIC_TENANT,type,conversionId,data,PUBLIC_TENANT,conversionId,type).run();
    return true;
  }catch(error){console.warn("conversion_event_write_failed",String(error?.message||error).slice(0,160));return false}
}
async function priorRegistrationSuccess(env,conversionId){
  if(!env?.DB||!validId(conversionId))return false;
  try{
    const row=await env.DB.prepare("SELECT 1 ok FROM audit_events WHERE tenant_id=? AND entity_type='conversion' AND entity_id=? AND event_type='MARKETING_REGISTRATION_SUCCESS' LIMIT 1").bind(PUBLIC_TENANT,conversionId).first();
    return !!row?.ok;
  }catch{return false}
}
function queue(ctx,promise){if(ctx?.waitUntil)ctx.waitUntil(promise);return promise}

async function handleConversionEvent({request,path,env,ctx}){
  if(String(request?.method||"").toUpperCase()!=="POST"||path!==EVENT_PATH)return null;
  if(!sameOrigin(request))return json({error:"origin_not_allowed"},403);
  let body;
  try{body=await readEventBody(request)}catch(error){return json({error:error.message==="payload_too_large"?"payload_too_large":"invalid_json"},error.message==="payload_too_large"?413:400)}
  const conversionId=safeText(body?.conversionId,64),stage=safeText(body?.stage,40),source=safeText(body?.source||"unknown",40),plan=safeText(body?.plan||"",40),eventPath=safeText(body?.path||"",120);
  if(!validId(conversionId)||!CLIENT_EVENTS.has(stage)||!VALID_SOURCES.has(source)||!VALID_PLANS.has(plan))return json({error:"invalid_conversion_event"},400);
  if(!await publicRateAllowed(request,env,conversionId))return json({error:"rate_limited"},429,{"retry-after":"60"});
  const work=recordEvent(env,{conversionId,stage,source,plan,path:eventPath});
  if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
  return json({ok:true},202);
}

async function recordRegistrationSuccess({request,path,env,response,ctx}){
  if(String(request?.method||"").toUpperCase()!=="POST"||path!==REGISTER_PATH||!response?.ok)return response;
  const conversionId=conversionIdFromRequest(request);
  if(!conversionId)return response;
  const work=recordEvent(env,{conversionId,stage:"registration_success",source:"unknown",plan:"",path:"/auth/"});
  if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
  return response;
}

async function recordWorkspaceReached({request,path,env,response,ctx}){
  if(String(request?.method||"").toUpperCase()!=="GET"||path!=="/app/"||!response?.ok)return response;
  if(!String(response.headers.get("content-type")||"").toLowerCase().includes("text/html"))return response;
  const conversionId=conversionIdFromRequest(request);
  if(!conversionId||!await priorRegistrationSuccess(env,conversionId))return response;
  const work=recordEvent(env,{conversionId,stage:"workspace_reached",source:"unknown",plan:"",path:"/app/"});
  if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
  const headers=new Headers(response.headers);
  headers.append("set-cookie",`${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Secure`);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export {
  conversionIdFromRequest,
  handleConversionEvent,
  priorRegistrationSuccess,
  publicRateAllowed,
  recordEvent,
  recordRegistrationSuccess,
  recordWorkspaceReached,
  sameOrigin,
  validId
};
