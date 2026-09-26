import {executeAgentReadTool} from "./agent-read-tools.js";
import {runGovernedFinanceObservation} from "./governed-finance-observation-runner.js";

export const FINANCE_WATCH_DURABLE_LOOP_VERSION="2026-09-26.v1";
const frozen=value=>Object.freeze(value);
const clean=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const parse=(value,fallback)=>{try{return JSON.parse(String(value??""))}catch{return fallback}};

export async function runFinanceWatchTask({env,task,attempt=0}={}){
  const tenantId=clean(task?.tenant_id??task?.tenantId,120);
  const taskId=clean(task?.id,120);
  if(!env?.DB||!tenantId||!taskId)return frozen({ok:false,code:"invalid_task_context",executionAllowed:false});

  const allowedTools=parse(task.allowed_tools_json,task.allowedTools??[]);
  const budget=parse(task.budget_json,task.budget??{});
  const previous=await env.DB.prepare("SELECT id,snapshot_hash,observed_at FROM agent_observation_checkpoints WHERE tenant_id=? AND persistent_task_id=? ORDER BY observed_at DESC,id DESC LIMIT 1").bind(tenantId,taskId).first();
  const auth=frozen({tenant_id:tenantId,role:"owner"});
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
  const auditId=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO agent_observation_checkpoints(id,tenant_id,persistent_task_id,snapshot_hash,snapshot_json,exception_json) VALUES(?,?,?,?,?,?)")
      .bind(checkpointId,tenantId,taskId,governed.change.currentHash,JSON.stringify(financeSnapshot),JSON.stringify(governed.exceptions)),
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,'OBSERVATION_VERIFIED',?)")
      .bind(eventId,tenantId,taskId,JSON.stringify({checkpointId,snapshotHash:governed.change.currentHash,changed:governed.change.changed,exceptionCount:governed.exceptions.length})),
    env.DB.prepare("INSERT INTO audit_events(id,tenant_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'AGENT_FINANCE_OBSERVATION_VERIFIED','agent_observation_checkpoint',?,?)")
      .bind(auditId,tenantId,checkpointId,JSON.stringify({persistentTaskId:taskId,snapshotHash:governed.change.currentHash,changed:governed.change.changed,externalActions:0}))
  ]);
  return frozen({...governed,persisted:true,checkpointId});
}

export async function runDueFinanceWatchTasks(env,{limit=25}={}){
  const cap=Math.max(1,Math.min(50,Number(limit)||25));
  const rows=await env.DB.prepare("SELECT id,tenant_id,status,objective,allowed_tools_json,budget_json FROM agent_persistent_tasks WHERE status='active' AND trigger_kind='scheduled' AND next_run_at IS NOT NULL AND next_run_at<=CURRENT_TIMESTAMP ORDER BY next_run_at,id LIMIT ?").bind(cap).all();
  const outcomes=[];
  for(const task of rows.results||[])outcomes.push(await runFinanceWatchTask({env,task}));
  return frozen({version:FINANCE_WATCH_DURABLE_LOOP_VERSION,selected:(rows.results||[]).length,verified:outcomes.filter(x=>x.persisted).length,failed:outcomes.filter(x=>!x.persisted).length,executionAllowed:false,externalActions:0,outcomes:frozen(outcomes)});
}
