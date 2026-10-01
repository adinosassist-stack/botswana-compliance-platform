import {executeAgentReadTool} from "./agent-read-tools.js";
import {validatePersistentTaskAllowedTools} from "./agent-tool-trust-registry.js";
import {businessGoalTemplate} from "./business-goals.js";
import {FINANCE_OBSERVER_AGENT_ID,loadCanonicalAgentAuthority} from "./agent-control-plane.js";

export const BUSINESS_GOAL_DURABLE_LOOP_VERSION="2026-10-01.v1";
const frozen=value=>Object.freeze(value);
const clean=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const parse=(value,fallback)=>{try{return JSON.parse(String(value??""))}catch{return fallback}};
const BUSINESS_GOAL_KEYS=Object.freeze(["protect_cash","grow_sales","stay_compliant","watch_operations","protect_property","morning_brief"]);

function sameToolSet(left,right){
  if(!Array.isArray(left)||!Array.isArray(right)||left.length!==right.length)return false;
  const a=[...left].sort(),b=[...right].sort();
  return a.every((value,index)=>value===b[index]);
}

export function validateBusinessGoalTask(task={}){
  const triggerSpec=parse(task.trigger_spec_json,task.triggerSpec??{});
  const templateKey=clean(triggerSpec?.templateKey,40);
  const template=businessGoalTemplate(templateKey);
  if(!template)return frozen({valid:false,code:"invalid_business_goal_template",templateKey});
  const tools=parse(task.allowed_tools_json,task.allowedTools??[]);
  const trusted=validatePersistentTaskAllowedTools(tools);
  if(!trusted.valid)return frozen({valid:false,code:trusted.code,templateKey});
  if(!sameToolSet(trusted.tools,[...template.allowedTools]))return frozen({valid:false,code:"business_goal_tool_contract_mismatch",templateKey});
  const cadence=clean(triggerSpec?.cadence,40)||"daily";
  if(!["daily","weekly"].includes(cadence))return frozen({valid:false,code:"invalid_business_goal_cadence",templateKey});
  return frozen({valid:true,templateKey,template,cadence,tools:frozen([...trusted.tools])});
}

export function nextBusinessGoalRunAt(task,scheduledFor,{now=new Date()}={}){
  const validated=validateBusinessGoalTask(task);
  if(!validated.valid)return null;
  const interval=validated.cadence==="weekly"?604800000:86400000;
  const anchor=new Date(String(scheduledFor||task?.next_run_at||"")),nowMs=new Date(now).getTime();
  if(!Number.isFinite(anchor.getTime())||!Number.isFinite(nowMs))return null;
  const elapsed=Math.max(0,nowMs-anchor.getTime());
  const intervals=Math.max(1,Math.floor(elapsed/interval)+1);
  return frozen({
    nextRunAt:new Date(anchor.getTime()+intervals*interval).toISOString(),
    skippedOccurrences:Math.max(0,intervals-1),
    cadence:validated.cadence
  });
}

export function buildBusinessGoalDueQuery(limit=25){
  const cap=Math.max(1,Math.min(50,Number(limit)||25));
  const placeholders=BUSINESS_GOAL_KEYS.map(()=>"?").join(",");
  const safeTriggerJson="CASE WHEN json_valid(trigger_spec_json) THEN trigger_spec_json ELSE '{}' END";
  return frozen({
    sql:`SELECT id,tenant_id,status,objective,trigger_spec_json,allowed_tools_json,budget_json,next_run_at
      FROM agent_persistent_tasks
      WHERE status='active' AND trigger_kind='scheduled' AND next_run_at IS NOT NULL
        AND next_run_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND json_extract(${safeTriggerJson},'$.templateKey') IN (${placeholders})
      ORDER BY next_run_at,id LIMIT ?`,
    bindings:frozen([...BUSINESS_GOAL_KEYS,cap])
  });
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function claimObservation(env,task){
  const tenantId=clean(task?.tenant_id,120),taskId=clean(task?.id,120),scheduledFor=clean(task?.next_run_at,80),claimId=crypto.randomUUID();
  if(!tenantId||!taskId||!scheduledFor)return frozen({ok:false,code:"invalid_business_goal_claim"});
  try{
    await env.DB.prepare("INSERT INTO agent_observation_claims(id,tenant_id,persistent_task_id,scheduled_for,status) VALUES(?,?,?,?,'running')")
      .bind(claimId,tenantId,taskId,scheduledFor).run();
    return frozen({ok:true,id:claimId,scheduledFor,attempts:1});
  }catch(error){
    if(!String(error).includes("UNIQUE"))throw error;
    const existing=await env.DB.prepare("SELECT id,status,attempts FROM agent_observation_claims WHERE tenant_id=? AND persistent_task_id=? AND scheduled_for=? LIMIT 1")
      .bind(tenantId,taskId,scheduledFor).first();
    if(!existing)return frozen({ok:false,code:"business_goal_claim_conflict"});
    if(existing.status==="failed"||existing.status==="running"){
      const updated=await env.DB.prepare("UPDATE agent_observation_claims SET status='running',attempts=attempts+1,started_at=CURRENT_TIMESTAMP,completed_at=NULL,checkpoint_id=NULL,error_code=NULL WHERE id=? AND tenant_id=? AND persistent_task_id=? AND (status='failed' OR (status='running' AND started_at<datetime('now','-30 minutes')))")
        .bind(existing.id,tenantId,taskId).run();
      if(Number(updated?.meta?.changes??updated?.changes??0)===1)return frozen({ok:true,id:existing.id,scheduledFor,attempts:Number(existing.attempts||1)+1,recovered:true});
    }
    return frozen({ok:false,code:"business_goal_already_claimed",status:existing.status});
  }
}

async function failClaim(env,task,claim,code){
  await env.DB.prepare("UPDATE agent_observation_claims SET status='failed',checkpoint_id=NULL,error_code=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running'")
    .bind(clean(code,120)||"business_goal_observation_failed",claim.id,task.tenant_id,task.id,claim.scheduledFor).run();
}

async function pauseForOwnerAttention(env,task,claim,code){
  const errorCode=clean(code,120)||"business_goal_observation_failed";
  const eventData=JSON.stringify({
    claimId:claim.id,scheduledFor:claim.scheduledFor,attempts:Number(claim.attempts||0),
    errorCode,executionAllowed:false,externalActions:0
  });
  const results=await env.DB.batch([
    env.DB.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_observation_claims WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running') OR NOT EXISTS (SELECT 1 FROM agent_persistent_tasks WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?) THEN json_extract('invalid','$.') ELSE 1 END")
      .bind(claim.id,task.tenant_id,task.id,claim.scheduledFor,task.id,task.tenant_id,claim.scheduledFor),
    env.DB.prepare("UPDATE agent_observation_claims SET status='failed',checkpoint_id=NULL,error_code=?,completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running'")
      .bind(errorCode,claim.id,task.tenant_id,task.id,claim.scheduledFor),
    env.DB.prepare("UPDATE agent_persistent_tasks SET status='paused',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?")
      .bind(task.id,task.tenant_id,claim.scheduledFor),
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,'OWNER_ATTENTION_REQUIRED',?)")
      .bind(crypto.randomUUID(),task.tenant_id,task.id,eventData),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,event_type,entity_type,entity_id,event_data) VALUES(?,'AGENT_BUSINESS_GOAL_OWNER_ATTENTION','agent_persistent_task',?,?)")
      .bind(task.tenant_id,task.id,eventData)
  ]);
  const claimChanges=Number(results?.[1]?.meta?.changes??results?.[1]?.changes??0);
  const taskChanges=Number(results?.[2]?.meta?.changes??results?.[2]?.changes??0);
  if(claimChanges!==1||taskChanges!==1)throw new Error("business_goal_owner_attention_guard_failed");
  return frozen({paused:true,errorCode,executionAllowed:false,externalActions:0});
}

export async function runBusinessGoalTask({env,task,claim}={}){
  const tenantId=clean(task?.tenant_id,120),taskId=clean(task?.id,120);
  if(!env?.DB||!tenantId||!taskId)return frozen({ok:false,persisted:false,code:"invalid_business_goal_context",executionAllowed:false,externalActions:0});
  const validated=validateBusinessGoalTask(task);
  if(!validated.valid)return frozen({...validated,ok:false,persisted:false,executionAllowed:false,externalActions:0});

  const observerAuthority=await loadCanonicalAgentAuthority(env,FINANCE_OBSERVER_AGENT_ID);
  if(observerAuthority.ready!==true||
    observerAuthority.agentId!==FINANCE_OBSERVER_AGENT_ID||
    observerAuthority.actorType!=="system_observer"||
    observerAuthority.state!=="active"||
    observerAuthority.executionCapable!==false){
    return frozen({ok:false,persisted:false,code:"business_goal_observer_identity_contained",executionAllowed:false,externalActions:0});
  }

  const auth=frozen({tenant_id:tenantId,role:"system_observer",systemActor:true,agentId:FINANCE_OBSERVER_AGENT_ID});
  const results={};
  for(const actionKey of validated.tools)results[actionKey]=await executeAgentReadTool(actionKey,{env,auth});
  const unavailable=Object.values(results).filter(result=>result?.allowed!==true||result?.available!==true);
  if(unavailable.length)return frozen({
    ok:false,persisted:false,code:"business_goal_source_unavailable",
    failedTools:frozen(unavailable.map(result=>clean(result?.actionKey,120))),
    executionAllowed:false,externalActions:0
  });

  const snapshot={};
  for(const actionKey of validated.tools)snapshot[actionKey]=results[actionKey].data;
  const snapshotJson=JSON.stringify(snapshot),snapshotHash=await sha256Hex(snapshotJson);
  const previous=await env.DB.prepare("SELECT snapshot_hash FROM agent_observation_checkpoints WHERE tenant_id=? AND persistent_task_id=? ORDER BY observed_at DESC,id DESC LIMIT 1")
    .bind(tenantId,taskId).first();
  const changed=!!previous&&String(previous.snapshot_hash||"")!==snapshotHash;
  const schedule=nextBusinessGoalRunAt(task,claim?.scheduledFor);
  if(!claim?.id||!claim?.scheduledFor||!schedule)return frozen({ok:false,persisted:false,code:"invalid_business_goal_schedule",executionAllowed:false,externalActions:0});

  const checkpointId=crypto.randomUUID();
  const checkpointState={
    templateKey:validated.templateKey,snapshotHash,changed,lastCheckedAt:new Date().toISOString(),
    nextRunAt:schedule.nextRunAt,toolCount:validated.tools.length,executionAllowed:false,externalActions:0
  };
  const eventData=JSON.stringify({
    checkpointId,templateKey:validated.templateKey,snapshotHash,changed,
    scheduledFor:claim.scheduledFor,nextRunAt:schedule.nextRunAt,
    skippedOccurrences:schedule.skippedOccurrences,cadence:schedule.cadence,
    toolCount:validated.tools.length,executionAllowed:false,externalActions:0
  });
  const batch=await env.DB.batch([
    env.DB.prepare("SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_observation_claims WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running') OR NOT EXISTS (SELECT 1 FROM agent_persistent_tasks WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?) THEN json_extract('invalid','$.') ELSE 1 END")
      .bind(claim.id,tenantId,taskId,claim.scheduledFor,taskId,tenantId,claim.scheduledFor),
    env.DB.prepare("INSERT INTO agent_observation_checkpoints(id,tenant_id,persistent_task_id,snapshot_hash,snapshot_json,exception_json,scheduled_for) VALUES(?,?,?,?,?,'[]',?)")
      .bind(checkpointId,tenantId,taskId,snapshotHash,snapshotJson,claim.scheduledFor),
    env.DB.prepare("UPDATE agent_observation_claims SET status='completed',checkpoint_id=?,error_code=NULL,completed_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running'")
      .bind(checkpointId,claim.id,tenantId,taskId,claim.scheduledFor),
    env.DB.prepare("UPDATE agent_persistent_tasks SET last_run_at=CURRENT_TIMESTAMP,next_run_at=?,checkpoint_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?")
      .bind(schedule.nextRunAt,JSON.stringify(checkpointState),taskId,tenantId,claim.scheduledFor),
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,'BUSINESS_GOAL_OBSERVATION_VERIFIED',?)")
      .bind(crypto.randomUUID(),tenantId,taskId,eventData),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,event_type,entity_type,entity_id,event_data) VALUES(?,'AGENT_BUSINESS_GOAL_OBSERVATION_VERIFIED','agent_observation_checkpoint',?,?)")
      .bind(tenantId,checkpointId,eventData)
  ]);
  const claimChanges=Number(batch?.[2]?.meta?.changes??batch?.[2]?.changes??0);
  const taskChanges=Number(batch?.[3]?.meta?.changes??batch?.[3]?.changes??0);
  if(claimChanges!==1||taskChanges!==1)throw new Error("business_goal_finalization_guard_failed");
  return frozen({
    ok:true,persisted:true,checkpointId,templateKey:validated.templateKey,changed,
    nextRunAt:schedule.nextRunAt,skippedOccurrences:schedule.skippedOccurrences,
    executionAllowed:false,externalActions:0,toolCalls:validated.tools.length
  });
}

export async function runDueBusinessGoalTasks(env,{limit=25}={}){
  const cap=Math.max(1,Math.min(50,Number(limit)||25));
  const placeholders=BUSINESS_GOAL_KEYS.map(()=>"?").join(",");
  const repaired=await env.DB.prepare(`UPDATE agent_persistent_tasks
    SET next_run_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=CURRENT_TIMESTAMP
    WHERE status='active' AND trigger_kind='scheduled' AND next_run_at IS NULL
      AND json_extract(CASE WHEN json_valid(trigger_spec_json) THEN trigger_spec_json ELSE '{}' END,'$.templateKey') IN (${placeholders})`).bind(...BUSINESS_GOAL_KEYS).run();

  const due=buildBusinessGoalDueQuery(cap);
  const rows=await env.DB.prepare(due.sql).bind(...due.bindings).all();
  const outcomes=[];
  for(const task of rows.results||[]){
    const claim=await claimObservation(env,task);
    if(!claim.ok){outcomes.push(frozen({ok:false,persisted:false,skipped:true,code:claim.code,executionAllowed:false,externalActions:0}));continue}
    let outcome;
    try{outcome=await runBusinessGoalTask({env,task,claim})}
    catch(error){outcome=frozen({ok:false,persisted:false,code:"business_goal_observation_failed",error:clean(error?.message||error,160),executionAllowed:false,externalActions:0})}
    if(!outcome.persisted){
      if(Number(claim.attempts||0)>=3){
        try{outcome=frozen({...outcome,ownerAttention:await pauseForOwnerAttention(env,task,claim,outcome.code)})}
        catch(error){await failClaim(env,task,claim,outcome.code);outcome=frozen({...outcome,code:"business_goal_owner_attention_failed",error:clean(error?.message||error,160)})}
      }else{
        await failClaim(env,task,claim,outcome.code);
      }
    }
    outcomes.push(outcome);
  }
  return frozen({
    version:BUSINESS_GOAL_DURABLE_LOOP_VERSION,
    repaired:Number(repaired?.meta?.changes??repaired?.changes??0),
    selected:(rows.results||[]).length,
    verified:outcomes.filter(result=>result.persisted).length,
    failed:outcomes.filter(result=>!result.persisted).length,
    executionAllowed:false,externalActions:0,outcomes:frozen(outcomes)
  });
}

export const __businessGoalDurableLoopTest=Object.freeze({
  BUSINESS_GOAL_KEYS,sameToolSet,nextBusinessGoalRunAt,validateBusinessGoalTask,buildBusinessGoalDueQuery
});
