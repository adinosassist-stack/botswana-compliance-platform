import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {installAgentCostTestSchema} from "./helpers/agent-cost-schema.mjs";
import {handleAgenticPersistentTaskRequest} from "../cloudflare/src/agentic-persistent-tasks.js";

const db=new DatabaseSync(":memory:");
try{
  installAgentCostTestSchema(db);
  const secret="runtime-test-secret",token="runtime-test-session",csrf="runtime-test-csrf";
  for(const tenant of ["tenant-a","tenant-b"])db.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run(tenant,tenant);
  db.prepare("INSERT INTO users(id,email,display_name) VALUES(?,?,?)").run("owner-a","runtime@example.test","Runtime owner");
  db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)").run("tenant-a","owner-a","owner","active");
  db.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))")
    .run(createHmac("sha256",secret).update(token).digest("hex"),"owner-a","tenant-a","owner",csrf);
  let auditFailure=false,beforeBatch=null;
  const wrap=(sql,args=[])=>({
    bind(...values){return wrap(sql,values)},
    async first(){return db.prepare(sql).get(...args)??null},
    async all(){return {results:db.prepare(sql).all(...args)}},
    async run(){
      if(auditFailure&&sql.includes("INSERT INTO audit_events"))throw new Error("synthetic_audit_unavailable");
      const result=db.prepare(sql).run(...args);
      return {meta:{changes:Number(result.changes)}};
    }
  });
  const DB={prepare:wrap,async batch(statements){
    if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook()}
    db.exec("BEGIN");
    try{const results=[];for(const statement of statements)results.push(await statement.run());db.exec("COMMIT");return results}
    catch(error){db.exec("ROLLBACK");throw error}
  }};
  const env={DB,SESSION_SECRET:secret,PUBLIC_ORIGIN:"https://app.example"};
  const base="/api/agentic/persistent-tasks";
  async function call(path=base,body={},headers={},method="POST"){
    const request=new Request(env.PUBLIC_ORIGIN+path,{method,headers:{cookie:`__Host-bw_session=${token}`,"x-csrf-token":csrf,origin:env.PUBLIC_ORIGIN,"content-type":"application/json",...headers},...(method==="GET"?{}:{body:JSON.stringify(body)})});
    const response=await handleAgenticPersistentTaskRequest({request,logicalPath:path,env});
    return {status:response.status,body:await response.json()};
  }
  const total=()=>Number(db.prepare("SELECT total_changes() n").get().n);
  const payload={objective:"Watch cash",allowedTools:["financial_position.read"],tenantId:"tenant-b",ownerUserId:"attacker",executionAllowed:true};
  for(const [body,headers,status] of [
    [payload,{cookie:""},401],[payload,{"x-csrf-token":"wrong"},403],
    [payload,{origin:"https://untrusted.example"},403],
    [{...payload,allowedTools:["payment.execute"]},{},400]
  ]){const before=total();assert.equal((await call(base,body,headers)).status,status);assert.equal(total(),before,"rejected requests must not write")}
  const created=await call(base,payload);
  assert.equal(created.status,201);assert.equal(created.body.executionAllowed,false);
  const taskId=created.body.id;
  const task=()=>db.prepare("SELECT tenant_id,owner_user_id,status FROM agent_persistent_tasks WHERE id=?").get(taskId);
  assert.deepEqual({...task()},{tenant_id:"tenant-a",owner_user_id:"owner-a",status:"active"});
  const receipts=()=>db.prepare("SELECT tenant_id,actor_user_id,event_type,event_data FROM audit_events WHERE entity_id=? ORDER BY id").all(taskId);
  assert.equal(receipts().length,1);assert.equal(receipts()[0].actor_user_id,"owner-a");assert.equal(receipts()[0].tenant_id,"tenant-a");
  db.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,owner_user_id,objective,trigger_kind) VALUES(?,?,?,?,'manual')").run("foreign-task","tenant-b","owner-a","Other tenant");
  const beforeForeign=total();assert.equal((await call(base+"/foreign-task/pause")).status,404);assert.equal(total(),beforeForeign);
  const listed=await call(base,{}, {},"GET");assert.deepEqual(listed.body.tasks.map(t=>t.id),[taskId]);
  db.prepare("UPDATE memberships SET role='manager' WHERE user_id='owner-a'").run();
  const beforeManager=total();assert.equal((await call(base+"/"+taskId+"/pause")).status,403);assert.equal(total(),beforeManager);
  db.prepare("UPDATE memberships SET role='owner' WHERE user_id='owner-a'").run();

  // Exercise a real failed audit write: neither state nor task-event receipt may commit.
  auditFailure=true;
  await assert.rejects(()=>call(base+"/"+taskId+"/pause"),/synthetic_audit_unavailable/);
  assert.equal(task().status,"active","audit failure must roll back task status");
  assert.equal(receipts().length,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_persistent_task_events WHERE persistent_task_id=?").get(taskId).n,1);
  auditFailure=false;
  const paused=await call(base+"/"+taskId+"/pause");assert.equal(paused.status,200);assert.equal(task().status,"paused");
  assert.equal(receipts().length,2);assert.deepEqual(JSON.parse(receipts()[1].event_data),{from:"active",to:"paused"});

  // Concurrent state change between the authenticated read and atomic batch must not
  // overwrite the newer state or manufacture a stale transition receipt.
  beforeBatch=()=>db.prepare("UPDATE agent_persistent_tasks SET status='active' WHERE id=?").run(taskId);
  const raced=await call(base+"/"+taskId+"/cancel");assert.equal(raced.status,409);assert.equal(raced.body.error,"persistent_task_transition_conflict");
  assert.equal(task().status,"active");assert.equal(receipts().length,2);
  assert.equal((await call(base+"/"+taskId+"/complete")).status,200);assert.equal(task().status,"completed");
  assert.equal(receipts().length,3);assert.deepEqual(JSON.parse(receipts()[2].event_data),{from:"active",to:"completed"});
  const beforeTerminal=total();assert.equal((await call(base+"/"+taskId+"/resume")).status,409);assert.equal(total(),beforeTerminal);
  assert.equal(db.prepare("SELECT status FROM agent_persistent_tasks WHERE id='foreign-task'").get().status,"active");
  console.log("Authenticated persistent-task gate: tenant/role/CSRF boundaries, atomic audit rollback and stale transitions PASS");
}finally{db.close()}
