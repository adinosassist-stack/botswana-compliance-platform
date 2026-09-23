import {evaluateAgentRuntimeGuard} from "./agent-runtime-guard.js";
import {prepareFinanceReconciliationSnapshot} from "./finance-core.js";
import {
  authenticate,roleAllowed,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus,safeFirst
} from "./agentic-authority-core.js";

export const AGENT_FINANCE_RECONCILIATION_VERSION="2026-09-23.runtime-guard-v1";
const ACTION_KEY="finance_reconciliation.prepare";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const text=(value,max=240)=>String(value??"").trim().slice(0,max);

function envTrue(value){return ["1","true","on","yes"].includes(String(value??"").trim().toLowerCase())}
function runtimeAgentStatus(env){return String(env?.AGENT_RUNTIME_ENABLED||"1")==="0"?"disabled":"enabled"}
function runtimeKillSwitch(env){return envTrue(env?.AGENT_RUNTIME_KILL_SWITCH)}
function runtimeBudgetStatus(env){return String(env?.AGENT_RUNTIME_BUDGET_STATUS||"within_limit")}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function canonicalRequest(body={}){
  return Object.freeze({
    accountId:text(body.accountId,64),
    statementFrom:text(body.statementFrom,10),
    statementTo:text(body.statementTo,10),
    openingBalanceMinor:Number.isSafeInteger(Number(body.openingBalanceMinor))?Number(body.openingBalanceMinor):body.openingBalanceMinor,
    closingBalanceMinor:Number.isSafeInteger(Number(body.closingBalanceMinor))?Number(body.closingBalanceMinor):body.closingBalanceMinor
  });
}

async function audit(env,auth,eventType,entityId,detail){
  await env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
    VALUES(?,?,?,?,?,?)`).bind(
      auth.tenant_id,auth.user_id,eventType,"agent_finance_reconciliation",entityId||null,JSON.stringify(detail||{})
    ).run();
}

async function verifyPlannerLinks(env,tenantId,runId,proposalId){
  if(runId){
    const run=await safeFirst(env,"SELECT id FROM agentic_runs WHERE id=? AND tenant_id=? LIMIT 1",[runId,tenantId]);
    if(!run)return {ok:false,error:"run_not_found",status:404};
  }
  if(proposalId){
    const proposal=await safeFirst(env,"SELECT id,run_id FROM agentic_proposals WHERE id=? AND tenant_id=? LIMIT 1",[proposalId,tenantId]);
    if(!proposal)return {ok:false,error:"proposal_not_found",status:404};
    if(runId&&String(proposal.run_id)!==String(runId))return {ok:false,error:"proposal_run_mismatch",status:409};
  }
  return {ok:true};
}

async function prepare({request,env,auth}){
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  let body;
  try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const runId=text(body?.runId,120)||null,proposalId=text(body?.proposalId,120)||null;
  const planner=await verifyPlannerLinks(env,auth.tenant_id,runId,proposalId);
  if(!planner.ok)return json({error:planner.error},planner.status);

  const requestPayload=canonicalRequest(body);
  const requestPayloadHash=await sha256Hex(JSON.stringify(requestPayload));
  const decision=evaluateAgentRuntimeGuard({
    agentKey:"thebe",
    actionKey:ACTION_KEY,
    actorRole:String(auth.role||"").toLowerCase(),
    tenantScoped:true,
    tenantId:String(auth.tenant_id),
    actorTenantId:String(auth.tenant_id),
    targetTenantId:String(auth.tenant_id),
    agentStatus:runtimeAgentStatus(env),
    killSwitchActive:runtimeKillSwitch(env),
    budgetStatus:runtimeBudgetStatus(env),
    approvalState:"none",
    actionPayloadHash:requestPayloadHash,
    mode:"shadow",
    globalExecutionEnabled:false,
    amountMinor:0,
    dailyActionCount:0,
    phase:"phase1"
  });

  if(decision.allowed!==true){
    try{
      await audit(env,auth,"AGENT_FINANCE_RECONCILIATION_DENIED",null,{
        actionKey:ACTION_KEY,runId,proposalId,requestPayloadHash,code:decision.code,guardVersion:decision.guardVersion
      });
    }catch{}
    return json({error:"finance_reconciliation_guard_denied",decision:{code:decision.code,reason:decision.reason,guardVersion:decision.guardVersion},execution:{performed:false}},409);
  }
  if(decision.executionAllowed===true)return json({error:"finance_prepare_guard_invariant_failed"},500);

  const first=await prepareFinanceReconciliationSnapshot({
    env,tenantId:auth.tenant_id,
    accountId:requestPayload.accountId,
    statementFrom:requestPayload.statementFrom,
    statementTo:requestPayload.statementTo,
    openingBalanceMinor:requestPayload.openingBalanceMinor,
    closingBalanceMinor:requestPayload.closingBalanceMinor,
    sha256Hex
  });
  if(!first.ok)return json({error:first.error},first.status||400);

  const verified=await prepareFinanceReconciliationSnapshot({
    env,tenantId:auth.tenant_id,
    accountId:first.accountId,
    statementFrom:first.statementFrom,
    statementTo:first.statementTo,
    openingBalanceMinor:first.openingBalanceMinor,
    closingBalanceMinor:first.statementClosingMinor,
    sha256Hex
  });
  if(!verified.ok)return json({error:verified.error},verified.status||409);
  if(verified.snapshotHash!==first.snapshotHash||verified.bookClosingMinor!==first.bookClosingMinor||verified.differenceMinor!==first.differenceMinor||verified.transactionCount!==first.transactionCount){
    try{
      await audit(env,auth,"AGENT_FINANCE_RECONCILIATION_STALE",null,{
        actionKey:ACTION_KEY,runId,proposalId,requestPayloadHash,firstSnapshotHash:first.snapshotHash,verifiedSnapshotHash:verified.snapshotHash,guardVersion:decision.guardVersion
      });
    }catch{}
    return json({error:"finance_snapshot_changed_retry",execution:{performed:false},verification:{status:"stale",firstSnapshotHash:first.snapshotHash,verifiedSnapshotHash:verified.snapshotHash}},409);
  }

  const proposalBindingHash=await sha256Hex(JSON.stringify({
    actionKey:ACTION_KEY,requestPayloadHash,snapshotHash:first.snapshotHash,
    accountId:first.accountId,statementFrom:first.statementFrom,statementTo:first.statementTo,
    openingBalanceMinor:first.openingBalanceMinor,statementClosingMinor:first.statementClosingMinor,
    bookClosingMinor:first.bookClosingMinor,differenceMinor:first.differenceMinor,transactionCount:first.transactionCount
  }));
  const auditId=crypto.randomUUID();
  try{
    await audit(env,auth,"AGENT_FINANCE_RECONCILIATION_PREPARED",auditId,{
      actionKey:ACTION_KEY,runId,proposalId,requestPayloadHash,proposalBindingHash,snapshotHash:first.snapshotHash,
      status:first.status,differenceMinor:first.differenceMinor,transactionCount:first.transactionCount,
      guardVersion:decision.guardVersion,guardCode:decision.code,verified:true,
      mutationPerformed:false,externalSideEffects:false
    });
  }catch{
    return json({error:"audit_ledger_unavailable",execution:{performed:false}},503);
  }

  return json({
    ok:true,
    version:AGENT_FINANCE_RECONCILIATION_VERSION,
    actionKey:ACTION_KEY,
    runId,proposalId,
    proposal:{
      accountId:first.accountId,
      accountName:first.accountName,
      statementFrom:first.statementFrom,
      statementTo:first.statementTo,
      openingBalanceMinor:first.openingBalanceMinor,
      statementClosingMinor:first.statementClosingMinor,
      bookClosingMinor:first.bookClosingMinor,
      differenceMinor:first.differenceMinor,
      transactionCount:first.transactionCount,
      snapshotHash:first.snapshotHash,
      currency:first.currency,
      status:first.status,
      bindingHash:proposalBindingHash
    },
    guard:{version:decision.guardVersion,code:decision.code,decision:decision.decision,humanReviewRequired:decision.policy?.humanReviewRequired===true},
    verification:{status:"verified",snapshotHash:first.snapshotHash,rechecked:true},
    approval:{required:true,status:"not_requested",scope:"record_reconciliation"},
    execution:{performed:false,enabled:false,writesToFinanceCore:false,externalSideEffects:false},
    authority:first.authority,
    audit:{eventId:auditId,eventType:"AGENT_FINANCE_RECONCILIATION_PREPARED"}
  },200);
}

export async function handleAgenticFinanceReconciliationRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/finance/reconciliation"))return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager","reviewer"))return json({error:"forbidden"},403);
  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }
  if(path==="/api/agentic/finance/reconciliation/status"&&request.method==="GET"){
    return json({
      enabled:true,
      version:AGENT_FINANCE_RECONCILIATION_VERSION,
      actionKey:ACTION_KEY,
      mode:"prepare_only",
      runtimeGuardRequired:true,
      approvalRequiredBeforeRecord:true,
      financeCoreWritesEnabled:false,
      externalSideEffectsEnabled:false,
      guarantees:["canonical_finance_core","tenant_scope","runtime_guard","snapshot_reverification","audit_ledger","no_hidden_execution"]
    });
  }
  if(path==="/api/agentic/finance/reconciliation/prepare"&&request.method==="POST")return prepare({request,env,auth});
  return json({error:"not_found"},404);
}

export const __agentFinanceReconciliationTest=Object.freeze({
  ACTION_KEY,
  canonicalRequest,
  runtimeAgentStatus,
  runtimeKillSwitch,
  runtimeBudgetStatus
});
