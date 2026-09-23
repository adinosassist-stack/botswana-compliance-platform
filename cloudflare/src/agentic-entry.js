import base from "./production-entry.js";
import {handleAgenticAuthorityRequest} from "./agentic-authority-core.js";
import {handleAgenticWhatsAppRequest} from "./agentic-whatsapp-core.js";
import {handleAgenticTaskExecutionRequest} from "./agentic-task-execution.js";
import {handleAgenticLiveVoiceRequest} from "./agentic-live-voice.js";
import {handleAgenticFinanceReconciliationRequest} from "./agentic-finance-reconciliation.js";
import {preparePlatformOwnerLogin,withPlatformOwnerAdminEnv} from "./platform-owner-access.js";
import {applyClientRuntimeIdentity} from "./client-runtime-identity.js";

const V81_SCHEMA_DELTA="050_v115_manual_bank_subscriptions.sql";
const COLD_START_REDUNDANT_RENDER="if(!options?.skipDataRefresh)queueMicrotask(()=>renderAll())";
const COLD_START_GUARDED_RENDER="if(!options?.skipDataRefresh&&!options?.roleRedirect)queueMicrotask(()=>renderAll())";
const SYNTHETIC_BOOT_TRACE_PREFIX="THEBE_SYNTHETIC_BOOT";
const SYNTHETIC_BOOT_TRACE_PARAMS=new Set(["desktop-owner-proof","authenticated-mobile-proof"]);
const SYNTHETIC_AUTH_ME_BOOT_SOURCE='const info=await productionApiClient.request("/api/auth/me");currentUser=';
const SYNTHETIC_STATE_BOOT_SOURCE='const st=consumeInitialWorkspaceState()||await apiFetch("/api/state");serverStateVersion=st.version||1;let nextStore;';
const SYNTHETIC_STORE_BOOT_SOURCE='nextStore.activeRole=currentUser.role;nextStore.audit=[];replaceWorkspaceStore(nextStore);';
const SYNTHETIC_RENDER_BOOT_SOURCE='renderAll();applyRoleUi();hideAuth();logEvent("APP_OPENED",{ruleset:"BW-2026.08.30-launch"});';
const SYNTHETIC_LANDING_BOOT_SOURCE='const landing=roleLandingView(currentUser.role);if(landing&&roleCanView(landing))showView(landing,{roleRedirect:true});';
const SYNTHETIC_READY_BOOT_SOURCE='try{await loadServerState();if(isWorkspaceRole(currentUser?.role))markWorkspaceReady()}';

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

function syntheticBootTraceRequested(request){
  try{
    if(String(request?.method||"").toUpperCase()!=="GET")return false;
    const url=new URL(request.url);
    if(url.pathname!=="/")return false;
    return [...SYNTHETIC_BOOT_TRACE_PARAMS].some(name=>url.searchParams.has(name));
  }catch{return false}
}

function uniqueSourceAnchor(source,needle){
  const first=source.indexOf(needle);
  return first>=0&&first===source.lastIndexOf(needle);
}

function injectSyntheticBootTrace(request,html){
  const source=String(html||"");
  if(!syntheticBootTraceRequested(request))return source;
  if(!uniqueSourceAnchor(source,SYNTHETIC_AUTH_ME_BOOT_SOURCE)||
    !uniqueSourceAnchor(source,SYNTHETIC_STATE_BOOT_SOURCE)||
    !uniqueSourceAnchor(source,SYNTHETIC_STORE_BOOT_SOURCE)||
    !uniqueSourceAnchor(source,SYNTHETIC_RENDER_BOOT_SOURCE)||
    !uniqueSourceAnchor(source,SYNTHETIC_LANDING_BOOT_SOURCE)||
    !uniqueSourceAnchor(source,SYNTHETIC_READY_BOOT_SOURCE))return source;
  return source
    .replace(
      SYNTHETIC_AUTH_ME_BOOT_SOURCE,
      `console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} auth_me_start");const info=await productionApiClient.request("/api/auth/me");console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} auth_me_complete");currentUser=`
    )
    .replace(
      SYNTHETIC_STATE_BOOT_SOURCE,
      `console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} state_start");const st=consumeInitialWorkspaceState()||await apiFetch("/api/state");console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} state_complete");serverStateVersion=st.version||1;let nextStore;`
    )
    .replace(
      SYNTHETIC_STORE_BOOT_SOURCE,
      `console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} store_start");nextStore.activeRole=currentUser.role;nextStore.audit=[];replaceWorkspaceStore(nextStore);console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} store_complete");`
    )
    .replace(
      SYNTHETIC_RENDER_BOOT_SOURCE,
      `console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} render_start");renderAll();console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} render_complete");applyRoleUi();console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} role_ui_complete");hideAuth();console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} reveal_complete");logEvent("APP_OPENED",{ruleset:"BW-2026.08.30-launch"});console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} app_open_logged");`
    )
    .replace(
      SYNTHETIC_LANDING_BOOT_SOURCE,
      `console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} landing_start");const landing=roleLandingView(currentUser.role);if(landing&&roleCanView(landing))showView(landing,{roleRedirect:true});console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} landing_complete");`
    )
    .replace(
      SYNTHETIC_READY_BOOT_SOURCE,
      `try{await loadServerState();if(isWorkspaceRole(currentUser?.role)){console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} workspace_ready_start");markWorkspaceReady();console.info("${SYNTHETIC_BOOT_TRACE_PREFIX} workspace_ready_complete")}}`
    );
}

async function delegatedAuthoritySchemaReady(env){
  if(!env?.DB)return false;
  try{
    await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM agent_delegations) delegation_count,
      (SELECT COUNT(*) FROM agent_action_intents) intent_count,
      (SELECT COUNT(*) FROM agent_delegation_events) event_count,
      (SELECT COUNT(*) FROM agent_execution_grants) execution_grant_count,
      (SELECT COUNT(*) FROM agent_task_requests) task_request_count,
      (SELECT COUNT(*) FROM agent_internal_tasks) internal_task_count,
      (SELECT COUNT(*) FROM agent_execution_receipts) execution_receipt_count,
      (SELECT COUNT(*) FROM finance_customers) finance_customer_count,
      (SELECT COUNT(*) FROM finance_invoices) finance_invoice_count,
      (SELECT COUNT(*) FROM finance_invoice_allocations) finance_invoice_allocation_count`).first();
    return true;
  }catch{return false}
}

async function hardenAuthenticatedColdStart(request,response){
  if(String(request?.method||"").toUpperCase()!=="GET")return response;
  const type=String(response?.headers?.get?.("content-type")||"").toLowerCase();
  if(!type.includes("text/html"))return response;
  let html;
  try{html=await response.clone().text()}catch{return response}
  const hasLegacyRender=html.includes(COLD_START_REDUNDANT_RENDER);
  const hasGuardedRender=html.includes(COLD_START_GUARDED_RENDER);
  const traceRequested=syntheticBootTraceRequested(request);
  if(!hasLegacyRender&&(!hasGuardedRender||!traceRequested))return response;
  const guarded=hasLegacyRender?html.replace(COLD_START_REDUNDANT_RENDER,COLD_START_GUARDED_RENDER):html;
  const hardened=traceRequested?injectSyntheticBootTrace(request,guarded):guarded;
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.set("x-thebe-cold-start-guard","role-redirect-v1");
  if(hardened!==guarded)headers.set("x-thebe-synthetic-boot-trace","auth-state-render-v4");
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
    const liveVoiceResponse=await handleAgenticLiveVoiceRequest({
      request,logicalPath,env,ctx,
      coreFetch:(innerRequest,innerEnv=env,innerCtx=ctx)=>base.fetch(innerRequest,innerEnv,innerCtx),
      taskFetch:(innerRequest,innerEnv=env)=>handleAgenticTaskExecutionRequest({
        request:innerRequest,
        logicalPath:logicalRequestPath(innerRequest),
        env:innerEnv
      })
    });
    if(liveVoiceResponse)return liveVoiceResponse;
    const whatsappResponse=await handleAgenticWhatsAppRequest({request,logicalPath,env});
    if(whatsappResponse)return whatsappResponse;
    const financeReconciliationResponse=await handleAgenticFinanceReconciliationRequest({request,logicalPath,env});
    if(financeReconciliationResponse)return financeReconciliationResponse;
    const taskExecutionResponse=await handleAgenticTaskExecutionRequest({request,logicalPath,env});
    if(taskExecutionResponse)return taskExecutionResponse;
    const authorityResponse=await handleAgenticAuthorityRequest({request,logicalPath,env});
    if(authorityResponse)return authorityResponse;
    env=withPlatformOwnerAdminEnv(env);
    request=await preparePlatformOwnerLogin(request,env);
    const response=await base.fetch(request,env,ctx);
    const runtimeResponse=await applyClientRuntimeIdentity(request,response);
    const hardenedResponse=await hardenAuthenticatedColdStart(request,runtimeResponse);
    if(hardenedResponse!==runtimeResponse)return enhanceReadiness(request,env,hardenedResponse);
    return enhanceReadiness(request,env,runtimeResponse);
  },
  async scheduled(event,env,ctx){
    return base.scheduled(event,env,ctx);
  }
};

export {delegatedAuthoritySchemaReady,enhanceReadiness,hardenAuthenticatedColdStart,injectSyntheticBootTrace,logicalRequestPath,syntheticBootTraceRequested,V81_SCHEMA_DELTA};