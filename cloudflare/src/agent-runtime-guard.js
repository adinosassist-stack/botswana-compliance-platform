import {AGENT_ACTION_CATALOG,evaluateAgentAction} from "./agent-policy.js";
import {evaluateDelegatedAuthority,isNeverAutonomousAction} from "./delegated-authority.js";

export const AGENT_RUNTIME_GUARD_VERSION="2026-09-20.pre-execution-v3";

function frozen(value){return Object.freeze(value)}
function deny(code,reason,{action=null,policy=null,authority=null}={}){
  return frozen({
    allowed:false,
    executionAllowed:false,
    decision:"deny",
    code,
    reason,
    guardVersion:AGENT_RUNTIME_GUARD_VERSION,
    action,
    policy,
    authority,
    preExecutionMonitor:true,
    auditRequired:true
  });
}

export function evaluateAgentRuntimeGuard({
  agentKey="thebe",
  actionKey,
  actorRole,
  tenantScoped=false,
  tenantId=null,
  actorTenantId=null,
  targetTenantId=null,
  agentStatus="enabled",
  killSwitchActive=false,
  budgetStatus="within_limit",
  approvalState="none",
  approvalPayloadHash=null,
  actionPayloadHash=null,
  strongAuth="none",
  delegation=null,
  mode="shadow",
  globalExecutionEnabled=false,
  amountMinor=0,
  dailyActionCount=0,
  phase="phase1",
  now=new Date()
}={}){
  const key=String(actionKey||"");
  const definition=AGENT_ACTION_CATALOG[key]||null;
  const scopedTenant=String(tenantId||"").trim();
  const actorTenant=String(actorTenantId||scopedTenant).trim();
  const targetTenant=String(targetTenantId||scopedTenant).trim();

  if(!definition)return deny("unknown_action","Unknown action; runtime guard fails closed.");
  if(tenantScoped!==true||!scopedTenant)return deny("tenant_scope_required","A verified tenant scope is required before an agent tool call.",{action:definition});
  if(!actorTenant||!targetTenant||actorTenant!==scopedTenant||targetTenant!==scopedTenant){
    return deny("cross_tenant_forbidden","Actor, target and authenticated tenant scope must match.",{action:definition});
  }
  if(String(agentStatus)!=="enabled")return deny("agent_disabled","Thebe execution is disabled for this agent identity.",{action:definition});
  if(killSwitchActive===true)return deny("runtime_kill_switch_active","The tenant or platform agent kill switch is active.",{action:definition});
  if(String(budgetStatus)!=="within_limit")return deny("agent_budget_exceeded","The applicable agent/model/action budget is not within its allowed limit.",{action:definition});

  if(isNeverAutonomousAction(key)){
    return deny("human_only_action","This action is permanently human-only and cannot be made autonomous by a model or delegation.",{action:definition});
  }

  const approval=String(approvalState||"none");
  const approvedHash=String(approvalPayloadHash||"").trim();
  const currentHash=String(actionPayloadHash||"").trim();
  if(approval==="approved"&&(!approvedHash||!currentHash)){
    return deny("approval_payload_binding_required","Approved actions must carry both the approved payload hash and the current action payload hash.",{action:definition});
  }
  if(approval==="approved"&&approvedHash!==currentHash){
    return deny("stale_approval_payload","Approval is bound to a different action payload; re-approval is required.",{action:definition});
  }

  const policy=evaluateAgentAction({
    agentKey,
    actionKey:key,
    actorRole,
    tenantScoped:true,
    strongAuth:strongAuth==="server_verified",
    approvalState,
    phase
  });
  if(policy.allowed!==true)return deny(policy.code||"policy_denied",policy.reason||"Agent policy denied the tool call.",{action:definition,policy});

  const authority=evaluateDelegatedAuthority({
    agentKey,
    actionKey:key,
    actionDefinition:definition,
    tenantId:scopedTenant,
    delegation,
    mode,
    globalExecutionEnabled,
    amountMinor,
    dailyActionCount,
    strongAuth,
    approvalState,
    now
  });
  if(authority.allowed!==true)return deny(authority.code||"authority_denied",authority.reason||"Delegated authority denied the tool call.",{action:definition,policy,authority});

  const executionRequested=String(mode)==="execute";
  if(executionRequested&&authority.executionAllowed!==true){
    return deny(authority.code||"execution_not_authorized","Execution was requested but deterministic delegated authority did not authorize side effects.",{action:definition,policy,authority});
  }

  return frozen({
    allowed:true,
    executionAllowed:executionRequested&&authority.executionAllowed===true,
    decision:executionRequested?"allow_execute":policy.decision,
    code:executionRequested?"runtime_execution_allowed":"runtime_policy_pass",
    reason:executionRequested
      ?"The tool call passed the deterministic pre-execution guard."
      :"The tool call passed the deterministic runtime guard without enabling execution.",
    guardVersion:AGENT_RUNTIME_GUARD_VERSION,
    action:definition,
    policy,
    authority,
    preExecutionMonitor:true,
    auditRequired:true
  });
}

export const __agentRuntimeGuardTest=Object.freeze({deny});
