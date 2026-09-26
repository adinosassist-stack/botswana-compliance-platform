import {buildFinanceObservationRun} from "./persistent-finance-observer.js";
import {evaluateFinanceWatchBudget} from "./finance-watch-budget.js";
import {verifyFinanceObservation} from "./finance-watch-verifier.js";
import {detectSnapshotChange} from "./finance-watch-change-detector.js";
import {detectFinanceExceptions} from "./finance-exception-detector.js";
import {prepareOwnerExceptions} from "./owner-exception-inbox.js";
import {decideFinanceWatchRecovery} from "./finance-watch-recovery.js";

export const GOVERNED_FINANCE_OBSERVATION_RUNNER_VERSION="2026-09-26.v1";
const frozen=value=>Object.freeze(value);
const clean=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

function deny(code){
  return frozen({version:GOVERNED_FINANCE_OBSERVATION_RUNNER_VERSION,ok:false,code,mode:"read_only",authority:"none",executionAllowed:false,externalActions:0,checkpointAllowed:false,ownerExceptions:frozen([])});
}

export async function runGovernedFinanceObservation({tenantId="",task={},results={},snapshot={},previousCheckpoint=null,attempt=0,toolCalls=0,elapsedMs=0}={}){
  const tenant=clean(tenantId,120),taskTenant=clean(task?.tenantId??task?.tenant_id,120);
  if(!tenant||!taskTenant||tenant!==taskTenant)return deny("tenant_mismatch");
  if(clean(task?.id,120)==="")return deny("task_id_required");
  if(task?.status&&task.status!=="active")return deny("task_not_active");

  const observationRun=buildFinanceObservationRun({task,observation:snapshot});
  const requestedTools=[...observationRun.reads];
  const budget=evaluateFinanceWatchBudget({toolCalls,externalActions:0,elapsedMs,maxToolCalls:Number(task?.budget?.maxToolCallsPerRun??4)});
  if(!budget.allowed)return frozen({...deny("budget_denied"),budget,observationRun});

  const verification=verifyFinanceObservation({requestedTools,results});
  const recovery=decideFinanceWatchRecovery({checkpoint:previousCheckpoint,verification,attempt});
  if(!verification.verified)return frozen({...deny("observation_unverified"),budget,verification,recovery,observationRun});

  const change=await detectSnapshotChange({previousHash:previousCheckpoint?.snapshotHash??previousCheckpoint?.snapshot_hash??null,snapshot});
  const exceptions=detectFinanceExceptions(snapshot);
  const ownerExceptions=prepareOwnerExceptions({taskId:task.id,exceptions});
  return frozen({
    version:GOVERNED_FINANCE_OBSERVATION_RUNNER_VERSION,
    ok:true,code:change.changed?"verified_change":"verified_no_change",
    tenantId:tenant,taskId:String(task.id),mode:"read_only",authority:"none",
    executionAllowed:false,externalActions:0,budget,verification,recovery,change,
    observationRun,exceptions,ownerExceptions,
    checkpointAllowed:verification.mayAdvanceCheckpoint===true,
    checkpoint:frozen({tenantId:tenant,persistentTaskId:String(task.id),snapshotHash:change.currentHash,snapshot,exceptions,writeRequiresTenantBoundPersistence:true}),
    externalDeliveryAllowed:false
  });
}
