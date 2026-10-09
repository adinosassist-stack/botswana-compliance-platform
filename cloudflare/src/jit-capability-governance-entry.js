import {authenticate,roleAllowed} from "./agentic-authority-core.js";
import {handleAgenticTaskExecutionRequest} from "./agentic-task-execution.js";
import {THEBE_AGENT_ID,loadCanonicalAgentAuthority} from "./agent-control-plane.js";
import {tenantContainmentFromEnv} from "./agent-runtime-containment.js";
import {
  AGENT_JIT_EXECUTION_TOOL_ID,
  issueJitExecutionCapabilityCredential,
  verifyJitExecutionCapabilityCredential
} from "./agent-capability-security.js";

const ACTION_KEY="task.create";
const MAX_EXECUTE_BODY_BYTES=16*1024;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff",
  ...headers
}});
const text=(value,max=240)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const capabilitySecret=env=>String(env?.AGENT_CAPABILITY_SECRET||"").trim();
const capabilitySecretReady=env=>capabilitySecret(env).length>=32;

async function readBoundedJsonClone(request){
  const clone=request.clone();
  const encoding=String(clone.headers.get("content-encoding")||"").trim().toLowerCase();
  if(encoding&&encoding!=="identity")return {ok:false,response:json({error:"unsupported_content_encoding"},415)};
  const declared=Number(clone.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>MAX_EXECUTE_BODY_BYTES)return {ok:false,response:json({error:"request_too_large"},413)};
  const raw=await clone.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_EXECUTE_BODY_BYTES)return {ok:false,response:json({error:"request_too_large"},413)};
  try{return {ok:true,body:raw?JSON.parse(raw):{}}}catch{return {ok:false,response:json({error:"invalid_json"},400)}}
}

async function taskRequestGrant(env,tenantId,requestId){
  try{
    return await env.DB.prepare(`SELECT execution_grant_id FROM agent_task_requests WHERE id=? AND tenant_id=? LIMIT 1`).bind(requestId,tenantId).first();
  }catch{return undefined}
}

async function authoritativePermit(env,tenantId,requestId,permitId){
  try{
    return await env.DB.prepare(`SELECT id,agent_id,human_user_id,task_request_id,execution_grant_id,action_key,payload_hash,status,max_uses,use_count,expires_at
      FROM agent_jit_execution_permits WHERE id=? AND tenant_id=? AND task_request_id=? LIMIT 1`).bind(permitId,tenantId,requestId).first();
  }catch{return undefined}
}

function augmentedJsonResponse(response,body){
  const headers=new Headers(response.headers);
  headers.delete("content-length");headers.delete("etag");
  headers.set("content-type","application/json; charset=utf-8");
  headers.set("cache-control","no-store");
  return new Response(JSON.stringify(body),{status:response.status,statusText:response.statusText,headers});
}

async function evaluateBoundContainment(env,auth){
  const authority=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
  return tenantContainmentFromEnv(env,auth?.tenant_id,authority);
}
function containmentResponse(containment){
  const unavailable=new Set(["agent_authority_unavailable","tenant_control_config_invalid"]);
  const status=unavailable.has(String(containment?.code||""))?503:409;
  return json({
    error:String(containment?.code||"runtime_containment_denied"),
    containment:{
      version:containment?.version||null,
      authorityState:containment?.authorityState||null
    }
  },status,status===503?{"retry-after":"30"}:{});
}

async function issueBoundCapability(request,env,requestId,auth,taskFetch){
  if(!capabilitySecretReady(env))return json({error:"jit_capability_signing_unavailable"},503,{"retry-after":"60"});
  const requestGrant=await taskRequestGrant(env,auth.tenant_id,requestId);
  if(requestGrant===undefined)return json({error:"jit_capability_authority_unavailable"},503,{"retry-after":"30"});
  const downstream=await taskFetch(request,env);
  if(!downstream?.ok)return downstream;
  let body;
  try{body=await downstream.clone().json()}catch{return json({error:"jit_capability_issue_failed"},503)}
  const permit=body?.permit;
  const permitId=text(permit?.id,120),payloadHash=text(permit?.payloadHash,160),permitExpiresAt=text(permit?.expiresAt,80);
  const executionGrantId=text(requestGrant?.execution_grant_id,120);
  if(!permitId||!payloadHash||!permitExpiresAt||!executionGrantId)return json({error:"jit_capability_issue_failed"},503);
  const executionEnvId=crypto.randomUUID();
  let credential;
  try{
    credential=await issueJitExecutionCapabilityCredential({
      secret:capabilitySecret(env),tenantId:auth.tenant_id,agentId:THEBE_AGENT_ID,humanUserId:auth.user_id,
      requestId,permitId,executionGrantId,actionKey:ACTION_KEY,toolId:AGENT_JIT_EXECUTION_TOOL_ID,
      payloadHash,executionEnvId,permitExpiresAt
    });
  }catch{return json({error:"jit_capability_issue_failed"},503)}
  return augmentedJsonResponse(downstream,{...body,permit:{
    ...permit,
    capabilityToken:credential.token,
    executionEnvId,
    capabilityExpiresAt:new Date(credential.payload.expiresAt*1000).toISOString()
  }});
}

async function verifyBoundCapability(request,env,requestId,auth,taskFetch){
  if(!capabilitySecretReady(env))return json({error:"jit_capability_verification_unavailable"},503,{"retry-after":"60"});
  const parsed=await readBoundedJsonClone(request);
  if(!parsed.ok)return parsed.response;
  const permitId=text(parsed.body?.permitId,120),token=String(parsed.body?.capabilityToken||"").trim(),executionEnvId=text(parsed.body?.executionEnvId,160);
  if(!permitId||!token||!executionEnvId)return json({error:"jit_capability_required"},409);
  const permit=await authoritativePermit(env,auth.tenant_id,requestId,permitId);
  if(permit===undefined)return json({error:"jit_capability_authority_unavailable"},503,{"retry-after":"30"});
  if(!permit)return json({error:"jit_capability_invalid"},409);
  const verification=await verifyJitExecutionCapabilityCredential({
    secret:capabilitySecret(env),token,tenantId:auth.tenant_id,agentId:permit.agent_id,humanUserId:auth.user_id,
    requestId,permitId,executionGrantId:permit.execution_grant_id,actionKey:permit.action_key,toolId:AGENT_JIT_EXECUTION_TOOL_ID,
    payloadHash:permit.payload_hash,executionEnvId,permitExpiresAt:permit.expires_at
  });
  if(!verification.valid)return json({error:"jit_capability_invalid"},409);
  if(String(permit.agent_id)!==THEBE_AGENT_ID||String(permit.human_user_id)!==String(auth.user_id)||String(permit.action_key)!==ACTION_KEY||
    String(permit.status)!=="active"||Number(permit.max_uses)!==1||Number(permit.use_count)!==0||new Date(permit.expires_at).getTime()<=Date.now()){
    return json({error:"jit_capability_invalid"},409);
  }
  return taskFetch(request,env);
}

export async function handleJitCapabilityGovernanceRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/task-execution"))return null;
  const taskFetch=(innerRequest,innerEnv=env)=>handleAgenticTaskExecutionRequest({request:innerRequest,logicalPath:path,env:innerEnv});
  const method=String(request.method||"GET").toUpperCase();
  const permit=path.match(/^\/api\/agentic\/task-execution\/requests\/([^/]+)\/jit-permit$/);
  const execute=path.match(/^\/api\/agentic\/task-execution\/requests\/([^/]+)\/execute$/);
  if(method!=="POST"||(!permit&&!execute))return taskFetch(request,env);

  const auth=await authenticate(request,env);
  if(!auth||!roleAllowed(auth,"owner"))return taskFetch(request,env);
  const containment=await evaluateBoundContainment(env,auth);
  if(containment.allowed!==true)return containmentResponse(containment);
  if(permit)return issueBoundCapability(request,env,permit[1],auth,taskFetch);
  return verifyBoundCapability(request,env,execute[1],auth,taskFetch);
}

export const __jitCapabilityGovernanceTest=Object.freeze({
  ACTION_KEY,THEBE_AGENT_ID,MAX_EXECUTE_BODY_BYTES,capabilitySecretReady,readBoundedJsonClone,evaluateBoundContainment,containmentResponse
});
