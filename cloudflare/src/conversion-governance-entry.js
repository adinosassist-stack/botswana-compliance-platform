import base from "./release-governance-entry.js";
import releaseMetadata from "../../release/production.json" with {type:"json"};

const EVENT_PATH="/api/marketing/conversion-event";
const REGISTER_PATH="/api/auth/register";
const COOKIE_NAME="thebe_cv";
const PUBLIC_TENANT="public-market";
const CLIENT_SCRIPT="/js/conversion-funnel-v14.js?v=20261013-v14";
const CLIENT_SURFACES=new Set(["/","/auth/","/home"]);
const CLIENT_EVENTS=new Set(["market_view","cta_click","registration_view","registration_submit"]);
const VALID_SOURCES=new Set(["market","hero","nav","product","pricing","mobile-sticky","final","unknown"]);
const VALID_PLANS=new Set(["","starter","business","pro","network","partner","monitor","protect","control"]);
const ID_RE=/^[a-zA-Z0-9_-]{16,64}$/;
const MAX_BODY_BYTES=2048;

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function pathOf(request){try{return new URL(request.url).pathname}catch{return ""}}
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
function sameOrigin(request){
  try{
    const url=new URL(request.url),origin=String(request.headers.get("origin")||"");
    return origin===url.origin;
  }catch{return false}
}
async function readEventBody(request){
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new Error("payload_too_large");
  const text=await request.text();
  if(new TextEncoder().encode(text).byteLength>MAX_BODY_BYTES)throw new Error("payload_too_large");
  try{return JSON.parse(text||"{}") }catch{throw new Error("invalid_json")}
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
async function handleClientEvent(request,env,ctx){
  if(!sameOrigin(request))return json({error:"origin_not_allowed"},403);
  let body;
  try{body=await readEventBody(request)}catch(error){return json({error:error.message==="payload_too_large"?"payload_too_large":"invalid_json"},error.message==="payload_too_large"?413:400)}
  const conversionId=safeText(body?.conversionId,64),stage=safeText(body?.stage,40),source=safeText(body?.source||"unknown",40),plan=safeText(body?.plan||"",40),path=safeText(body?.path||"",120);
  if(!validId(conversionId)||!CLIENT_EVENTS.has(stage)||!VALID_SOURCES.has(source)||!VALID_PLANS.has(plan))return json({error:"invalid_conversion_event"},400);
  const work=recordEvent(env,{conversionId,stage,source,plan,path});
  if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
  return json({ok:true},202);
}
function injectClient(response){
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!response.ok||!type.includes("text/html"))return Promise.resolve(response);
  return response.text().then(html=>{
    if(html.includes("/js/conversion-funnel-v14.js")||!html.toLowerCase().includes("</body>"))return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
    const index=html.toLowerCase().lastIndexOf("</body>");
    const next=html.slice(0,index)+`<script src="${CLIENT_SCRIPT}" defer></script>\n`+html.slice(index);
    const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("cache-control","no-store");
    return new Response(next,{status:response.status,statusText:response.statusText,headers});
  });
}
function clearConversionCookie(response){
  const headers=new Headers(response.headers);
  headers.append("set-cookie",`${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax; Secure`);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const path=pathOf(request),method=String(request.method||"GET").toUpperCase();
    if(method==="POST"&&path===EVENT_PATH)return handleClientEvent(request,env,ctx);

    const conversionId=cookieValue(request,COOKIE_NAME);
    const response=await base.fetch(request,env,ctx);

    if(method==="POST"&&path===REGISTER_PATH&&response.ok&&validId(conversionId)){
      const work=recordEvent(env,{conversionId,stage:"registration_success",source:"unknown",plan:"",path:"/auth/"});
      if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
    }

    if(method==="GET"&&path==="/app/"&&response.ok&&validId(conversionId)&&String(response.headers.get("content-type")||"").toLowerCase().includes("text/html")){
      if(await priorRegistrationSuccess(env,conversionId)){
        const work=recordEvent(env,{conversionId,stage:"workspace_reached",source:"unknown",plan:"",path:"/app/"});
        if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
        return clearConversionCookie(response);
      }
    }

    if(method==="GET"&&CLIENT_SURFACES.has(path))return injectClient(response);
    return response;
  },
  async scheduled(event,env,ctx){return base.scheduled(event,env,ctx)}
};

export {recordEvent,priorRegistrationSuccess,validId,sameOrigin};
