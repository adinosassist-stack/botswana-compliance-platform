import {__financeWatchDurableLoopTest as financeWatch} from "../../cloudflare/src/finance-watch-durable-loop.js";

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8"}});

async function reset(DB){
  await DB.batch([
    DB.prepare("DROP TABLE IF EXISTS audit_events"),
    DB.prepare("DROP TABLE IF EXISTS audit_chain_state"),
    DB.prepare("DROP TABLE IF EXISTS agent_observation_claims"),
    DB.prepare("DROP TABLE IF EXISTS agent_observation_checkpoints"),
    DB.prepare("DROP TABLE IF EXISTS agent_persistent_tasks")
  ]);
  await DB.batch([
    DB.prepare("CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,actor_user_id TEXT,event_type TEXT NOT NULL,entity_type TEXT,entity_id TEXT,event_data TEXT NOT NULL DEFAULT '{}',occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,tenant_seq INTEGER,prev_hash TEXT,event_hash TEXT,integrity_version INTEGER,write_source TEXT NOT NULL DEFAULT 'server')"),
    DB.prepare("CREATE UNIQUE INDEX audit_tenant_seq_unique ON audit_events(tenant_id,tenant_seq) WHERE tenant_seq IS NOT NULL"),
    DB.prepare("CREATE UNIQUE INDEX uq_audit_finance_observation_checkpoint_event ON audit_events(tenant_id,event_type,entity_id) WHERE entity_type='agent_observation_checkpoint' AND event_type IN ('AGENT_FINANCE_OBSERVATION_VERIFIED','AGENT_FINANCE_OBSERVATION_RECOVERED')"),
    DB.prepare("CREATE TABLE audit_chain_state(tenant_id TEXT PRIMARY KEY,last_event_id INTEGER,last_hash TEXT,event_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    DB.prepare("CREATE TABLE agent_observation_claims(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,persistent_task_id TEXT NOT NULL,scheduled_for TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 1,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,checkpoint_id TEXT,error_code TEXT)"),
    DB.prepare("CREATE TABLE agent_observation_checkpoints(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,persistent_task_id TEXT NOT NULL,snapshot_hash TEXT NOT NULL,scheduled_for TEXT)"),
    DB.prepare("CREATE TABLE agent_persistent_tasks(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,status TEXT NOT NULL,next_run_at TEXT,last_run_at TEXT,updated_at TEXT)")
  ]);
}

async function state(DB){
  const [claim,task,audits,chain]=await Promise.all([
    DB.prepare("SELECT status,checkpoint_id FROM agent_observation_claims WHERE id='claim-1'").first(),
    DB.prepare("SELECT next_run_at FROM agent_persistent_tasks WHERE id='task-1'").first(),
    DB.prepare("SELECT id,event_type,entity_id,tenant_seq,prev_hash,event_hash,integrity_version,write_source,event_data FROM audit_events WHERE tenant_id='tenant-1' ORDER BY id").all(),
    DB.prepare("SELECT last_hash,event_count FROM audit_chain_state WHERE tenant_id='tenant-1'").first()
  ]);
  return {claim,task,audits:audits.results||[],chain};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true});
    if(url.pathname!=="/probe"||request.method!=="POST")return json({ok:false},404);

    const scheduledFor="2026-09-26T06:15:00.000Z";
    const nextRunAt="2026-09-27T06:15:00.000Z";
    await reset(env.DB);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO agent_observation_claims(id,tenant_id,persistent_task_id,scheduled_for,status,attempts) VALUES('claim-1','tenant-1','task-1',?,'running',2)").bind(scheduledFor),
      env.DB.prepare("INSERT INTO agent_observation_checkpoints(id,tenant_id,persistent_task_id,snapshot_hash,scheduled_for) VALUES('cp-1','tenant-1','task-1','hash-1',?)").bind(scheduledFor),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,next_run_at) VALUES('task-1','tenant-1','active',?)").bind(scheduledFor)
    ]);

    const task={id:"task-1",tenant_id:"tenant-1",next_run_at:scheduledFor,trigger_spec_json:'{"cadence":"daily"}'};
    const claim={id:"claim-1",scheduledFor,recovered:true,attempts:2};
    const runtimeEnv={DB:env.DB,AUDIT_INTEGRITY_SECRET:env.AUDIT_INTEGRITY_SECRET};

    const first=await financeWatch.recoverVerifiedOccurrence(runtimeEnv,task,claim);
    const afterFirst=await state(env.DB);

    await env.DB.batch([
      env.DB.prepare("UPDATE agent_observation_claims SET status='running',checkpoint_id=NULL,error_code=NULL,completed_at=NULL WHERE id='claim-1'"),
      env.DB.prepare("UPDATE agent_persistent_tasks SET next_run_at=?,last_run_at=NULL WHERE id='task-1'").bind(scheduledFor)
    ]);

    let replayThrew=false,replayMessage="";
    try{
      await financeWatch.recoverVerifiedOccurrence(runtimeEnv,task,claim);
    }catch(error){
      replayThrew=true;
      replayMessage=String(error?.message||error).slice(0,240);
    }
    const afterReplay=await state(env.DB);

    return json({scheduledFor,nextRunAt,first,afterFirst,replay:{threw:replayThrew,message:replayMessage},afterReplay});
  }
};
