import base from "./production-entry.js";
import {handleAgenticAuthorityRequest} from "./agentic-authority-core.js";
import {handleAgenticWhatsAppRequest} from "./agentic-whatsapp-core.js";
import {preparePlatformOwnerLogin,withPlatformOwnerAdminEnv} from "./platform-owner-access.js";

const V81_SCHEMA_DELTA="047_v81_delegated_authority.sql";
const COLD_START_REDUNDANT_RENDER="if(!options?.skipDataRefresh)queueMicrotask(()=>renderAll())";
const COLD_START_GUARDED_RENDER="if(!options?.skipDataRefresh&&!options?.roleRedirect)queueMicrotask(()=>renderAll())";

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

async function delegatedAuthoritySchemaReady(env){
  if(!env?.DB)return false;
  try{
    await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM agent_delegations) delegation_count,
      (SELECT COUNT(*) FROM agent_action_intents) intent_count,
      (SELECT COUNT(*) FROM agent_delegation_events) event_count`).first();
    return true;
  }catch{return false}
}

async function hardenAuthenticatedColdStart(request,response){
  if(String(request?.method||"").toUpperCase()!=="GET")return response;
  const type=String(response?.headers?.get?.("content-type")||"").toLowerCase();
  if(!type.includes("text/html"))return response;
  let html;
  try{html=await response.clone().text()}catch{return response}
  if(!html.includes(COLD_START_REDUNDANT_RENDER))return response;
  const hardened=html.replace(COLD_START_REDUNDANT_RENDER,COLD_START_GUARDED_RENDER);
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("x-thebe-cold-start-guard","role-redirect-v1");
  return new Response(hardened,{status:response.status,statusText:response.statusText,headers});
}

async function enhanceReadiness(request,env,response){
  if(request.method!=="GET"||logicalRequestPath(request)!=="/api/ready")return response;
  let body;
  try{body=await response.clone().json()}catch{return response}
  const authoritySchemaReady=await delegatedAuthoritySchemaReady(env);
  const coreSchemaReady=body?.schemaReady===true;
  const schemaReady=coreSchemaReady&&authoritySchemaReady;
  const next={
    ...body,
    schemaReady,
    coreSchemaReady,
    agenticAuthoritySchemaReady:authoritySchemaReady,
    latestSchemaDelta:V81_SCHEMA_DELTA
  };
  if(!schemaReady&&!next.error)next.error="schema_outdated";
  const headers=new Headers(response.headers);
  headers.set("content-type","application/json; charset=utf-8");
  headers.set("cache-control","no-store");
  return new Response(JSON.stringify(next),{
    status:schemaReady?response.status:503,
    statusText:response.statusText,
    headers
  });
}

export default {
  async fetch(request,env,ctx){
    const logicalPath=logicalRequestPath(request);
    const whatsappResponse=await handleAgenticWhatsAppRequest({request,logicalPath,env});
    if(whatsappResponse)return whatsappResponse;
    const authorityResponse=await handleAgenticAuthorityRequest({request,logicalPath,env});
    if(authorityResponse)return authorityResponse;
    env=withPlatformOwnerAdminEnv(env);
    request=await preparePlatformOwnerLogin(request,env);
    let response=await base.fetch(request,env,ctx);
    response=await hardenAuthenticatedColdStart(request,response);
    return enhanceReadiness(request,env,response);
  },
  async scheduled(event,env,ctx){
    return base.scheduled(event,env,ctx);
  }
};

export {delegatedAuthoritySchemaReady,enhanceReadiness,hardenAuthenticatedColdStart,logicalRequestPath,V81_SCHEMA_DELTA};
