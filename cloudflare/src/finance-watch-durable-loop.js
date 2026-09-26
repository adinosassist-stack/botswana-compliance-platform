import {executeAgentReadTool} from "./agent-read-tools.js";
import {runGovernedFinanceObservation} from "./governed-finance-observation-runner.js";
import {buildFinanceWatchDueQuery,isFinanceWatchToolList} from "./finance-watch-contract.js";

export const FINANCE_WATCH_DURABLE_LOOP_VERSION="2026-09-26.v13";
const frozen=value=>Object.freeze(value);
const clean=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const parse=(value,fallback)=>{try{return JSON.parse(String(value??""))}catch{return fallback}};
function nextRunAt(task,scheduledFor,{now=new Date()}={}){
  const spec=parse(task.trigger_spec_json,task.triggerSpec??{}),cadence=String(spec.cadence||"daily").toLowerCase();
  const ms={daily:86400000,weekly:604800000}[cadence];
  const anchor=new Date(String(scheduledFor||task?.next_run_at||"")),nowMs=new Date(now).getTime();
  if(!ms||!Number.isFinite(anchor.getTime())||!Number.isFinite(nowMs))return null;
  const elapsed=Math.max(0,nowMs-anchor.getTime()),intervals=Math.max(1,Math.floor(elapsed/ms)+1);
  return Object.freeze({nextRunAt:new Date(anchor.getTime()+intervals*ms).toISOString(),skippedOccurrences:Math.max(0,intervals-1),cadence});
}

export async function runFinanceWatchTask({env,task,attempt=0,claim=null}={}){
  const tenantId=clean(task?.tenant_id??task?.tenantId,120);
  const taskId=clean(task?.id,120);
  if(!env?.DB||!tenantId||!taskId)return frozen({ok:false,code:"invalid_task_context",executionAllowed:false});

  const allowedTools=parse(task.allowed_tools_json,task.allowedTools??[]);
  if(!isFinanceWatchToolList(allowedTools))return frozen({ok:false,persisted:false,code:"invalid_finance_watch_tools",executionAllowed:false,externalActions:0});
  const budget=parse(task.budget_json,task.budget??{});
  const previous=await env.DB.prepare("SELECT id,snapshot_hash,observed_at FROM agent_observation_checkpoints WHERE tenant_id=? AND persistent_task_id=? ORDER BY observed_at DESC,id DESC LIMIT 1").bind(tenantId,taskId).first();
  const auth=frozen({tenant_id:tenantId,role:"system_observer",systemActor:true});
  const results={};let toolCalls=0;
  const started=Date.now();
  for(const actionKey of allowedTools){
    results[actionKey]=await executeAgentReadTool(actionKey,{env,auth});
    toolCalls++;
  }
  const snapshot={};
  for(const [key,result] of Object.entries(results))if(result?.available===true&&result?.allowed===true)snapshot[key]=result.data;

  const financeSnapshot={
    ...(snapshot["financial_position.read"]||{}),
    ...(snapshot["finance_data_quality.read"]||{}),
    dailyInflows:snapshot["finance_daily_inflows.read"]||null,
    receivables:snapshot["receivables_summary.read"]||null
  };
  const governed=await runGovernedFinanceObservation({
    tenantId,
    task:{...task,tenantId,allowedTools,budget,status:task.status||"active"},
    results,
    snapshot:financeSnapshot,
    previousCheckpoint:previous?{id:previous.id,snapshotHash:previous.snapshot_hash}:null,
    attempt,toolCalls,elapsedMs:Date.now()-started
  });
  if(!governed.ok||!governed.checkpointAllowed)return frozen({...governed,persisted:false});

  const checkpointId=crypto.randomUUID();
  const eventId=crypto.randomUUID();
  const schedule=claim?.id&&claim?.scheduledFor?nextRunAt(task,claim.scheduledFor):null;
  if(claim?.id&&claim?.scheduledFor&&!schedule)return frozen({...governed,persisted:false,code:"invalid_observation_cadence",executionAllowed:false});
  const next=schedule?.nextRunAt||null,skippedOccurrences=schedule?.skippedOccurrences||0;
  const observationMeta={scheduledFor:claim?.scheduledFor||null,nextRunAt:next,skippedOccurrences,cadence:schedule?.cadence||null};
  const statements=[
    env.DB.prepare("INSERT INTO agent_observation_checkpoints(id,tenant_id,persistent_task_id,snapshot_hash,snapshot_json,exception_json,scheduled_for) VALUES(?,?,?,?,?,?,?)")
      .bind(checkpointId,tenantId,taskId,governed.change.currentHash,JSON.stringify(financeSnapshot),JSON.stringify(governed.exceptions),claim?.scheduledFor||null),
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,'OBSERVATION_VERIFIED',?)")
      .bind(eventId,tenantId,taskId,JSON.stringify({checkpointId,snapshotHash:governed.change.currentHash,changed:governed.change.changed,exceptionCount:governed.exceptions.length,...observationMeta})),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,event_type,entity_type,entity_id,event_data) VALUES(?,'AGENT_FINANCE_OBSERVATION_VERIFIED','agent_observation_checkpoint',?,?)")
      .bind(tenantId,checkpointId,JSON.stringify({persistentTaskId:taskId,snapshotHash:governed.change.currentHash,changed:governed.change.changed,externalActions:0,...observationMeta}))
  ];
  if(claim?.id&&claim?.scheduledFor){
    statements.push(
      env.DB.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_observation_claims WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running') OR NOT EXISTS (SELECT 1 FROM agent_persistent_tasks WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?) THEN json_extract('invalid','$.') ELSE 1 END")
        .bind(claim.id,tenantId,taskId,claim.scheduledFor,taskId,tenantId,claim.scheduledFor),
      env.DB.prepare("UPDATE agent_observation_claims SET status='completed',checkpoint_id=?,error_code=NULL,completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running'")
        .bind(checkpointId,claim.id,tenantId,taskId,claim.scheduledFor),
      env.DB.prepare("UPDATE agent_persistent_tasks SET last_run_at=CURRENT_TIMESTAMP,next_run_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?")
        .bind(next,taskId,tenantId,claim.scheduledFor)
    );
  }
  const batchResults=await env.DB.batch(statements);
  if(claim?.id&&claim?.scheduledFor){
    const claimChanges=Number(batchResults?.[4]?.meta?.changes??batchResults?.[4]?.changes??0);
    const taskChanges=Number(batchResults?.[5]?.meta?.changes??batchResults?.[5]?.changes??0);
    if(claimChanges!==1||taskChanges!==1)throw new Error("observation_finalization_guard_failed");
  }
  return frozen({...governed,persisted:true,checkpointId,finalized:!!claim?.id,nextRunAt:next,skippedOccurrences});
}

async function claimObservation(env,task){
  const tenantId=clean(task.tenant_id,120),taskId=clean(task.id,120),scheduledFor=clean(task.next_run_at,80),claimId=crypto.randomUUID();
  if(!tenantId||!taskId||!scheduledFor)return frozen({ok:false,code:"invalid_observation_claim"});
  try{
    await env.DB.prepare("INSERT INTO agent_observation_claims(id,tenant_id,persistent_task_id,scheduled_for,status) VALUES(?,?,?,?,'running')").bind(claimId,tenantId,taskId,scheduledFor).run();
    return frozen({ok:true,id:claimId,scheduledFor,attempts:1});
  }catch(error){
    if(!String(error).includes("UNIQUE"))throw error;
    const existing=await env.DB.prepare("SELECT id,status,attempts,started_at FROM agent_observation_claims WHERE tenant_id=? AND persistent_task_id=? AND scheduled_for=? LIMIT 1").bind(tenantId,taskId,scheduledFor).first();
    if(!existing)return frozen({ok:false,code:"observation_claim_conflict"});
    const stale=existing.status==="running"&&new Date(existing.started_at).getTime()<Date.now()-30*60*1000;
    if(existing.status==="failed"||stale){
      const updated=await env.DB.prepare("UPDATE agent_observation_claims SET status='running',attempts=attempts+1,started_at=CURRENT_TIMESTAMP,completed_at=NULL,checkpoint_id=NULL,error_code=NULL WHERE id=? AND tenant_id=? AND persistent_task_id=? AND (status='failed' OR (status='running' AND started_at<datetime('now','-30 minutes')))").bind(existing.id,tenantId,taskId).run();
      if(Number(updated?.meta?.changes??updated?.changes??0)===1)return frozen({ok:true,id:existing.id,scheduledFor,attempts:Number(existing.attempts||1)+1,recovered:true});
    }
    return frozen({ok:false,code:"observation_already_claimed",status:existing.status});
  }
}
async function failObservationClaim(env,task,claim,outcome){
  const errorCode=outcome?.code||outcome?.recovery?.code||null;
  await env.DB.prepare("UPDATE agent_observation_claims SET status='failed',checkpoint_id=NULL,error_code=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND persistent_task_id=? AND status='running'").bind(errorCode,claim.id,task.tenant_id,task.id).run();
}

async function recoverVerifiedOccurrence(env,task,claim){
  if(!claim?.recovered||!claim?.scheduledFor)return null;
  const checkpoint=await env.DB.prepare("SELECT id FROM agent_observation_checkpoints WHERE tenant_id=? AND persistent_task_id=? AND scheduled_for=? LIMIT 1").bind(task.tenant_id,task.id,claim.scheduledFor).first();
  if(!checkpoint)return null;
  const schedule=nextRunAt(task,claim.scheduledFor),next=schedule?.nextRunAt||null;
  if(!next)return frozen({ok:false,persisted:false,code:"invalid_observation_cadence",executionAllowed:false});
  const recoveryMeta={persistentTaskId:task.id,scheduledFor:claim.scheduledFor,nextRunAt:next,skippedOccurrences:schedule?.skippedOccurrences||0,cadence:schedule?.cadence||null,claimId:claim.id,checkpointId:checkpoint.id,externalActions:0};
  const results=await env.DB.batch([
    env.DB.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_observation_claims WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running') OR NOT EXISTS (SELECT 1 FROM agent_persistent_tasks WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?) THEN json_extract('invalid','$.') ELSE 1 END").bind(claim.id,task.tenant_id,task.id,claim.scheduledFor,task.id,task.tenant_id,claim.scheduledFor),
    env.DB.prepare("UPDATE agent_observation_claims SET status='completed',checkpoint_id=?,error_code=NULL,completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running'").bind(checkpoint.id,claim.id,task.tenant_id,task.id,claim.scheduledFor),
    env.DB.prepare("UPDATE agent_persistent_tasks SET last_run_at=CURRENT_TIMESTAMP,next_run_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?").bind(next,task.id,task.tenant_id,claim.scheduledFor),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,event_type,entity_type,entity_id,event_data) VALUES(?,'AGENT_FINANCE_OBSERVATION_RECOVERED','agent_observation_checkpoint',?,?)").bind(task.tenant_id,checkpoint.id,JSON.stringify(recoveryMeta))
  ]);
  const claimChanges=Number(results?.[1]?.meta?.changes??results?.[1]?.changes??0),taskChanges=Number(results?.[2]?.meta?.changes??results?.[2]?.changes??0);
  if(claimChanges!==1||taskChanges!==1)throw new Error("observation_recovery_finalization_guard_failed");
  return frozen({ok:true,code:"verified_occurrence_recovered",persisted:true,checkpointId:checkpoint.id,finalized:true,recovered:true,nextRunAt:next,skippedOccurrences:schedule?.skippedOccurrences||0,executionAllowed:false,externalActions:0,toolCalls:0});
}

export async function runDueFinanceWatchTasks(env,{limit=25}={}){
  const cap=Math.max(1,Math.min(50,Number(limit)||25));
  const due=buildFinanceWatchDueQuery(cap);\n  const rows=await env.DB.prepare(due.sql).bind(...due.bindings).all();\n  const outcomes=[];
  for(const task of rows.results||[]){
    const claim=await claimObservation(env,task);
    if(!claim.ok){outcomes.push(frozen({ok:false,persisted:false,skipped:true,code:claim.code,executionAllowed:false}));continue}
    let outcome;
    try{outcome=await recoverVerifiedOccurrence(env,task,claim)||await runFinanceWatchTask({env,task,attempt:claim.attempts-1,claim})}catch(error){outcome=frozen({ok:false,persisted:false,code:"observation_run_failed",executionAllowed:false,error:String(error?.message||error).slice(0,160)})}
    outcomes.push(outcome);
    if(!outcome.persisted)await failObservationClaim(env,task,claim,outcome);
  }
  return frozen({version:FINANCE_WATCH_DURABLE_LOOP_VERSION,selected:(rows.results||[]).length,verified:outcomes.filter(x=>x.persisted).length,failed:outcomes.filter(x=>!x.persisted).length,executionAllowed:false,externalActions:0,outcomes:frozen(outcomes)});
}

export const __financeWatchDurableLoopTest=Object.freeze({nextRunAt,claimObservation,recoverVerifiedOccurrence});
