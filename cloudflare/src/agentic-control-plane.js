import {authenticate,roleAllowed,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus} from "./agentic-authority-core.js";
import {
  AGENT_CONTROL_PLANE_VERSION,THEBE_AGENT_ID,FINANCE_OBSERVER_AGENT_ID,BUSINESS_GOAL_OBSERVER_AGENT_ID,
  loadCanonicalAgentAuthority,authorityPermitsExecution,evaluateCanonicalAgentDrift,transitionCanonicalAgentAuthority
} from "./agent-control-plane.js";
import {loadAgentCostOutcomeSummary} from "./agent-cost-outcome-telemetry.js";

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const clean=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const rows=result=>Array.isArray(result?.results)?result.results:Array.isArray(result)?result:[];
function platformAdminEmails(env){
  return new Set(String(env?.PLATFORM_ADMIN_EMAILS||"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean));
}
export function isPlatformAdminAuth(env,auth){
  const email=String(auth?.email||"").trim().toLowerCase();
  return roleAllowed(auth,"owner")&&!!email&&platformAdminEmails(env).has(email);
}
async function status(env){
  const [thebe,financeObserver,businessObserver,drift]=await Promise.all([
    loadCanonicalAgentAuthority(env,THEBE_AGENT_ID),
    loadCanonicalAgentAuthority(env,FINANCE_OBSERVER_AGENT_ID),
    loadCanonicalAgentAuthority(env,BUSINESS_GOAL_OBSERVER_AGENT_ID),
    evaluateCanonicalAgentDrift(env,{persist:false})
  ]);
  const ready=thebe.ready&&financeObserver.ready&&businessObserver.ready&&drift.ok;
  return json({
    version:AGENT_CONTROL_PLANE_VERSION,
    ready,
    agents:[
      {...thebe,executionPermitted:authorityPermitsExecution(thebe)},
      {...financeObserver,executionPermitted:false},
      {...businessObserver,executionPermitted:false}
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

function parseJsonObject(value){
  if(value&&typeof value==="object"&&!Array.isArray(value))return value;
  try{
    const parsed=JSON.parse(String(value||"{}"));
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
  }catch{return {}}
}

export async function loadTenantOperatorTelemetry(env,tenantId){
  const tenant=clean(tenantId,120);
  if(!env?.DB||!tenant)return Object.freeze({available:false,reason:"operator_telemetry_unavailable"});
  try{
    const [persistent,claims7d,runs7d,requests,receipts30d,grants,budgetResult,lastActivity,costToOutcome]=await Promise.all([
      env.DB.prepare(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,
        SUM(CASE WHEN status='paused' THEN 1 ELSE 0 END) paused,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed
        FROM agent_persistent_tasks WHERE tenant_id=?`).bind(tenant).first(),
      env.DB.prepare(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,
        SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) running,
        COALESCE(SUM(attempts),0) attempts
        FROM agent_observation_claims
        WHERE tenant_id=? AND created_at>=datetime('now','-7 days')`).bind(tenant).first(),
      env.DB.prepare(`SELECT
        COUNT(*) total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,
        SUM(CASE WHEN generation_mode='governed_ai_advisor' THEN 1 ELSE 0 END) governed_ai,
        SUM(CASE WHEN generation_mode='deterministic_fallback' THEN 1 ELSE 0 END) deterministic_fallback
        FROM agentic_runs
        WHERE tenant_id=? AND created_at>=datetime('now','-7 days')`).bind(tenant).first(),
      env.DB.prepare(`SELECT
        SUM(CASE WHEN status='prepared' THEN 1 ELSE 0 END) prepared,
        SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved,
        SUM(CASE WHEN status='executed' THEN 1 ELSE 0 END) executed
        FROM agent_task_requests WHERE tenant_id=?`).bind(tenant).first(),
      env.DB.prepare(`SELECT COUNT(*) succeeded
        FROM agent_execution_receipts
        WHERE tenant_id=? AND created_at>=datetime('now','-30 days')`).bind(tenant).first(),
      env.DB.prepare(`SELECT COUNT(*) active
        FROM agent_execution_grants WHERE tenant_id=? AND status='active'`).bind(tenant).first(),
      env.DB.prepare(`SELECT budget_json,risk_policy_json
        FROM agent_persistent_tasks WHERE tenant_id=? AND status='active'`).bind(tenant).all(),
      env.DB.prepare(`SELECT MAX(activity_at) last_activity_at FROM (
          SELECT created_at activity_at FROM agentic_runs WHERE tenant_id=?
          UNION ALL SELECT created_at FROM agent_observation_claims WHERE tenant_id=?
          UNION ALL SELECT created_at FROM agent_execution_receipts WHERE tenant_id=?
        )`).bind(tenant,tenant,tenant).first(),
      loadAgentCostOutcomeSummary(env,tenant,{windowDays:7})
    ]);

    let configuredReadCeilingPerRun=0,externalActionBudgetViolations=0;
    for(const row of rows(budgetResult)){
      const budget=parseJsonObject(row?.budget_json),risk=parseJsonObject(row?.risk_policy_json);
      configuredReadCeilingPerRun+=Math.max(0,Math.floor(number(budget.maxToolCallsPerRun)));
      if(number(budget.maxExternalActions)!==0||risk.externalActions===true)externalActionBudgetViolations+=1;
    }
    const claimsTotal=number(claims7d?.total),claimsCompleted=number(claims7d?.completed),claimsFailed=number(claims7d?.failed);
    const settledClaims=claimsCompleted+claimsFailed;
    const successRatePct=settledClaims>0?Math.round((claimsCompleted/settledClaims)*1000)/10:null;

    return Object.freeze({
      available:true,
      generatedAt:new Date().toISOString(),
      windows:Object.freeze({activityDays:7,verifiedExecutionDays:30}),
      persistentObjectives:Object.freeze({
        total:number(persistent?.total),active:number(persistent?.active),paused:number(persistent?.paused),completed:number(persistent?.completed),
        configuredReadCeilingPerRun
      }),
      observations:Object.freeze({
        total7d:claimsTotal,completed7d:claimsCompleted,failed7d:claimsFailed,running7d:number(claims7d?.running),
        attempts7d:number(claims7d?.attempts),successRatePct
      }),
      planning:Object.freeze({
        runs7d:number(runs7d?.total),completed7d:number(runs7d?.completed),failed7d:number(runs7d?.failed),
        governedAiRuns7d:number(runs7d?.governed_ai),deterministicFallbackRuns7d:number(runs7d?.deterministic_fallback)
      }),
      approvals:Object.freeze({
        prepared:number(requests?.prepared),approvedAwaitingExecution:number(requests?.approved)
      }),
      execution:Object.freeze({
        activeGrants:number(grants?.active),verifiedSucceeded30d:number(receipts30d?.succeeded)
      }),
      authorityBoundary:Object.freeze({
        externalActionBudgetViolations,
        telemetryCanMutate:false,
        telemetryCanGrantAuthority:false
      }),
      costToOutcome,
      providerSpend:Object.freeze({
        metered:false,
        mode:costToOutcome?.available===true?"shadow":"unavailable",
        currency:costToOutcome?.available===true?"BWP":null,
        amountMinor:null,
        budgetEnforcement:false,
        reason:costToOutcome?.available===true?"shadow_telemetry_not_provider_billing_ledger":"provider_cost_not_metered"
      }),
      lastActivityAt:clean(lastActivity?.last_activity_at,64)||null
    });
  }catch(error){
    return Object.freeze({available:false,reason:"operator_telemetry_unavailable",detail:clean(error?.message||error,160)});
  }
}

async function operatorTelemetry(env,auth){
  const telemetry=await loadTenantOperatorTelemetry(env,auth?.tenant_id);
  return json({telemetry},telemetry.available?200:503);
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
  if(path==="/api/agentic/control-plane/operator-telemetry"&&request.method==="GET")return operatorTelemetry(env,auth);
  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }
  const stateRoute=path.match(/^\/api\/agentic\/control-plane\/agents\/([^/]+)\/state$/);
  if(stateRoute&&request.method==="POST")return transition({request,env,auth,agentId:stateRoute[1]});
  if(path==="/api/agentic/control-plane/drift/evaluate"&&request.method==="POST")return evaluateDrift(env,auth);
  return json({error:"not_found"},404);
}

export const __agenticControlPlaneTest=Object.freeze({platformAdminEmails,parseJsonObject});