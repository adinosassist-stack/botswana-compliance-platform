const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8"}});

async function resetDatabase(DB){
  await DB.exec(`
DROP TABLE IF EXISTS agent_observation_claims;
DROP TABLE IF EXISTS agent_persistent_tasks;
DROP TABLE IF EXISTS agent_observation_checkpoints;
DROP TABLE IF EXISTS agent_persistent_task_events;
DROP TABLE IF EXISTS audit_events;
CREATE TABLE agent_observation_claims(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  persistent_task_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL,
  checkpoint_id TEXT,
  error_code TEXT,
  completed_at TEXT
);
CREATE TABLE agent_persistent_tasks(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  next_run_at TEXT,
  last_run_at TEXT,
  updated_at TEXT
);
CREATE TABLE agent_observation_checkpoints(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  persistent_task_id TEXT NOT NULL,
  snapshot_hash TEXT
);
CREATE TABLE agent_persistent_task_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  persistent_task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT
);
CREATE TABLE audit_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_data TEXT
);
`);
}

const guard=(DB,{claimId,tenantId,taskId,scheduledFor})=>DB.prepare(
  "SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM agent_observation_claims WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running') OR NOT EXISTS (SELECT 1 FROM agent_persistent_tasks WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?) THEN json_extract('invalid','$.') ELSE 1 END"
).bind(claimId,tenantId,taskId,scheduledFor,taskId,tenantId,scheduledFor);

async function artifactCount(DB,id){
  const tables=["agent_observation_checkpoints","agent_persistent_task_events","audit_events"];
  let total=0;
  for(const table of tables){
    const row=await DB.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE id=?`).bind(id).first();
    total+=Number(row?.c||0);
  }
  return total;
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({ok:true});
    if(url.pathname!=="/probe"||request.method!=="POST")return json({ok:false},404);

    const tenantId="tenant-d1",taskId="task-d1",claimId="claim-d1";
    const scheduledFor="2026-09-26T06:15:00.000Z";
    const staleNextRunAt="2026-09-26T07:15:00.000Z";
    const successNextRunAt="2026-09-27T06:15:00.000Z";

    await resetDatabase(env.DB);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO agent_observation_claims(id,tenant_id,persistent_task_id,scheduled_for,status) VALUES(?,?,?,?,?)").bind(claimId,tenantId,taskId,scheduledFor,"running"),
      env.DB.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,next_run_at) VALUES(?,?,?,?)").bind(taskId,tenantId,"active",staleNextRunAt)
    ]);

    let failureThrew=false,failureMessage="";
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO agent_observation_checkpoints(id,tenant_id,persistent_task_id,snapshot_hash) VALUES(?,?,?,?)").bind("cp-fail",tenantId,taskId,"hash-fail"),
        env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,?,?)").bind("ev-fail",tenantId,taskId,"OBSERVATION_VERIFIED","{}"),
        env.DB.prepare("INSERT INTO audit_events(id,tenant_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,?,?,?,?)").bind("au-fail",tenantId,"AGENT_FINANCE_OBSERVATION_VERIFIED","agent_observation_checkpoint","cp-fail","{}"),
        guard(env.DB,{claimId,tenantId,taskId,scheduledFor}),
        env.DB.prepare("UPDATE agent_observation_claims SET status='completed',checkpoint_id=? WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running'").bind("cp-fail",claimId,tenantId,taskId,scheduledFor),
        env.DB.prepare("UPDATE agent_persistent_tasks SET next_run_at=? WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?").bind(successNextRunAt,taskId,tenantId,scheduledFor)
      ]);
    }catch(error){
      failureThrew=true;
      failureMessage=String(error?.message||error).slice(0,240);
    }

    const failedArtifacts={
      checkpoint:await artifactCount(env.DB,"cp-fail"),
      event:await artifactCount(env.DB,"ev-fail"),
      audit:await artifactCount(env.DB,"au-fail")
    };
    const claimAfterFailure=await env.DB.prepare("SELECT status,checkpoint_id FROM agent_observation_claims WHERE id=?").bind(claimId).first();
    const taskAfterFailure=await env.DB.prepare("SELECT next_run_at FROM agent_persistent_tasks WHERE id=?").bind(taskId).first();

    await env.DB.prepare("UPDATE agent_persistent_tasks SET next_run_at=? WHERE id=?").bind(scheduledFor,taskId).run();

    let successThrew=false,successMessage="";
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO agent_observation_checkpoints(id,tenant_id,persistent_task_id,snapshot_hash) VALUES(?,?,?,?)").bind("cp-ok",tenantId,taskId,"hash-ok"),
        env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,?,?)").bind("ev-ok",tenantId,taskId,"OBSERVATION_VERIFIED","{}"),
        env.DB.prepare("INSERT INTO audit_events(id,tenant_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,?,?,?,?)").bind("au-ok",tenantId,"AGENT_FINANCE_OBSERVATION_VERIFIED","agent_observation_checkpoint","cp-ok","{}"),
        guard(env.DB,{claimId,tenantId,taskId,scheduledFor}),
        env.DB.prepare("UPDATE agent_observation_claims SET status='completed',checkpoint_id=? WHERE id=? AND tenant_id=? AND persistent_task_id=? AND scheduled_for=? AND status='running'").bind("cp-ok",claimId,tenantId,taskId,scheduledFor),
        env.DB.prepare("UPDATE agent_persistent_tasks SET next_run_at=? WHERE id=? AND tenant_id=? AND status='active' AND next_run_at=?").bind(successNextRunAt,taskId,tenantId,scheduledFor)
      ]);
    }catch(error){
      successThrew=true;
      successMessage=String(error?.message||error).slice(0,240);
    }

    const successArtifacts={
      checkpoint:await artifactCount(env.DB,"cp-ok"),
      event:await artifactCount(env.DB,"ev-ok"),
      audit:await artifactCount(env.DB,"au-ok")
    };
    const claimAfterSuccess=await env.DB.prepare("SELECT status,checkpoint_id FROM agent_observation_claims WHERE id=?").bind(claimId).first();
    const taskAfterSuccess=await env.DB.prepare("SELECT next_run_at FROM agent_persistent_tasks WHERE id=?").bind(taskId).first();

    return json({
      runtime:"wrangler-local-d1",
      failure:{threw:failureThrew,message:failureMessage,artifacts:failedArtifacts,claim:claimAfterFailure,task:taskAfterFailure},
      success:{threw:successThrew,message:successMessage,artifacts:successArtifacts,claim:claimAfterSuccess,task:taskAfterSuccess}
    });
  }
};
