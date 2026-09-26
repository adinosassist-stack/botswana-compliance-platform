import {authenticate,roleAllowed,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus} from "./agentic-authority-core.js";
import {
  AGENT_CONTROL_PLANE_VERSION,THEBE_AGENT_ID,FINANCE_OBSERVER_AGENT_ID,
  loadCanonicalAgentAuthority,authorityPermitsExecution,evaluateCanonicalAgentDrift,transitionCanonicalAgentAuthority
} from "./agent-control-plane.js";

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const clean=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
function platformAdminEmails(env){
  return new Set(String(env?.PLATFORM_ADMIN_EMAILS||"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean));
}
export function isPlatformAdminAuth(env,auth){
  const email=String(auth?.email||"").trim().toLowerCase();
  return roleAllowed(auth,"owner")&&!!email&&platformAdminEmails(env).has(email);
}
async function status(env){
  const [thebe,observer,drift]=await Promise.all([
    loadCanonicalAgentAuthority(env,THEBE_AGENT_ID),
    loadCanonicalAgentAuthority(env,FINANCE_OBSERVER_AGENT_ID),
    evaluateCanonicalAgentDrift(env,{persist:false})
  ]);
  const ready=thebe.ready&&observer.ready&&drift.ok;
  return json({
    version:AGENT_CONTROL_PLANE_VERSION,
    ready,
    agents:[
      {...thebe,executionPermitted:authorityPermitsExecution(thebe)},
      {...observer,executionPermitted:false}
    ],
    drift:{available:drift.ok,drifted:drift.drifted===true,findings:drift.findings||[]},
    guarantees:[
      "registry_does_not_replace_runtime_guard",
      "registry_does_not_create_delegations_or_grants",
      "execution_requires_active_canonical_thebe_identity",
      "revoked_identity_is_terminal",
      "platform_admin_only_state_transitions"
    ]
  },ready?200:503);
}
async function transition({request,env,auth,agentId}){
  if(!isPlatformAdminAuth(env,auth))return json({error:"platform_admin_required"},403);
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const result=await transitionCanonicalAgentAuthority({
    env,
    agentId:clean(agentId,120),
    newState:clean(body?.state,24),
    reasonCode:clean(body?.reasonCode,120),
    actorType:"platform_admin",
    actorId:auth.user_id,
    auditTenantId:auth.tenant_id
  });
  if(!result.ok){
    const statusCode=result.code==="invalid_authority_state"||result.code==="authority_reason_required"?400:
      result.code==="agent_identity_missing"?404:
      result.code==="agent_registry_unavailable"?503:409;
    return json({error:result.code,authority:result.authority||null},statusCode);
  }
  return json({ok:true,replayed:result.replayed,authority:result.authority,evidenceHash:result.evidenceHash});
}
async function evaluateDrift(env,auth){
  if(!isPlatformAdminAuth(env,auth))return json({error:"platform_admin_required"},403);
  const result=await evaluateCanonicalAgentDrift(env,{persist:true});
  return json(result,result.ok?200:503);
}

export async function handleAgenticControlPlaneRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/control-plane"))return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);

  if(path==="/api/agentic/control-plane/status"&&request.method==="GET")return status(env);
  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }
  const stateRoute=path.match(/^\/api\/agentic\/control-plane\/agents\/([^/]+)\/state$/);
  if(stateRoute&&request.method==="POST")return transition({request,env,auth,agentId:stateRoute[1]});
  if(path==="/api/agentic/control-plane/drift/evaluate"&&request.method==="POST")return evaluateDrift(env,auth);
  return json({error:"not_found"},404);
}

export const __agenticControlPlaneTest=Object.freeze({platformAdminEmails});
