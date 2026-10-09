import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {preflightAgentObservation} from "../cloudflare/src/agent-observation-preflight.js";
import {handleAgenticPersistentTaskRequest} from "../cloudflare/src/agentic-persistent-tasks.js";
const base={tenantId:"tenant-a",actorId:"owner-a",taskClass:"summary",actionKey:"financial_position.read",budgetUsd:0.1,models:[{id:"evaluated",enabled:true,taskClasses:["summary"],estimatedCostUsd:0.01,evalPassRate:0.99}]};
assert.equal(preflightAgentObservation(base).ok,true);
assert.equal(preflightAgentObservation(base).executionAllowed,false);
assert.equal(preflightAgentObservation({...base,tenantId:""}).reason,"missing_authority_context");
assert.equal(preflightAgentObservation({...base,actionKey:"payment.execute"}).reason,"tool_not_trusted");
assert.equal(preflightAgentObservation({...base,budgetUsd:0.001}).reason,"no_approved_model");
assert.equal(preflightAgentObservation({...base,payloadBytes:999999}).ok,false);
assert.equal(preflightAgentObservation({...base,actorId:""}).reason,"missing_authority_context");
assert.equal(preflightAgentObservation({...base,taskClass:"write"}).reason,"unsupported_task_class");
assert.equal(preflightAgentObservation({...base,models:[]}).reason,"no_approved_model");
assert.equal(preflightAgentObservation({...base,payloadBytes:-1}).reason,"invalid_payload_size");
assert.equal(preflightAgentObservation({...base,payloadBytes:NaN}).reason,"invalid_payload_size");
assert.equal(preflightAgentObservation({...base,payloadBytes:0.5}).reason,"invalid_payload_size");
assert.equal(preflightAgentObservation(null).reason,"invalid_input");
assert.equal(preflightAgentObservation([]).reason,"invalid_input");
console.log("agent observation preflight: PASS");

// Exercise the actual request boundary with real session and membership queries.
const sqlite=new DatabaseSync(":memory:");
try{
  sqlite.exec(fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8"));
  const secret="preflight-test-secret",token="preflight-test-session",csrf="preflight-test-csrf";
  const hash=createHmac("sha256",secret).update(token).digest("hex");
  sqlite.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("tenant-a","Preflight tenant");
  sqlite.prepare("INSERT INTO users(id,email,display_name) VALUES(?,?,?)").run("owner-a","preflight@example.test","Preflight owner");
  sqlite.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)").run("tenant-a","owner-a","owner","active");
  sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))")
    .run(hash,"owner-a","tenant-a","owner",csrf);
  const DB={prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {first(){return statement.get(...args)??null}}}}}};
  const env={DB,SESSION_SECRET:secret,PUBLIC_ORIGIN:"https://app.example",AGENT_APPROVED_MODELS_JSON:JSON.stringify(base.models)};
  const path="/api/agentic/persistent-tasks/preflight";
  const payload={actionKey:base.actionKey,taskClass:base.taskClass,budgetUsd:base.budgetUsd};
  async function call(body=payload,{headers={},environment={},method="POST",rawBody}={}){
    const request=new Request(env.PUBLIC_ORIGIN+path,{method,headers:{cookie:`__Host-bw_session=${token}`,"x-csrf-token":csrf,origin:env.PUBLIC_ORIGIN,"content-type":"application/json",...headers},...(method==="GET"?{}:{body:rawBody??JSON.stringify(body)})});
    const response=await handleAgenticPersistentTaskRequest({request,logicalPath:path,env:{...env,...environment}});
    assert.equal(response.headers.get("cache-control"),"no-store");
    return {status:response.status,body:await response.json()};
  }
  async function rejected(body,options,status,code){
    const result=await call(body,options);
    assert.equal(result.status,status);
    assert.equal(result.body.error??result.body.reason,code);
    assert.notEqual(result.body.ok,true);
    assert.notEqual(result.body.executionAllowed,true);
  }
  const before=sqlite.prepare("SELECT total_changes() n").get().n;
  const accepted=await call({...payload,tenantId:"tenant-b",actorId:"attacker",executionAllowed:true,payloadBytes:0});
  assert.equal(accepted.status,200);
  assert.equal(accepted.body.tenantId,"tenant-a");
  assert.equal(accepted.body.actorId,"owner-a");
  assert.equal(accepted.body.modelId,"evaluated");
  assert.equal(accepted.body.executionAllowed,false);
  assert.equal(accepted.body.requiresRuntimeGuard,true);
  await rejected(payload,{headers:{cookie:""}},401,"unauthorized");
  await rejected(payload,{headers:{cookie:"__Host-bw_session=forged"}},401,"unauthorized");
  await rejected(payload,{headers:{"x-csrf-token":"wrong"}},403,"forbidden");
  await rejected(payload,{headers:{origin:"https://untrusted.example"}},403,"forbidden");
  await rejected({...payload,models:base.models},{},400,"caller_model_catalog_forbidden");
  await rejected(payload,{environment:{AGENT_APPROVED_MODELS_JSON:"{"}},503,"model_catalog_unavailable");
  await rejected(payload,{environment:{AGENT_APPROVED_MODELS_JSON:"{}"}},503,"model_catalog_unavailable");
  await rejected(payload,{environment:{AGENT_APPROVED_MODELS_JSON:JSON.stringify(Array(101).fill(base.models[0]))}},503,"model_catalog_unavailable");
  await rejected(payload,{environment:{AGENT_APPROVED_MODELS_JSON:""}},403,"no_approved_model");
  await rejected({...payload,budgetUsd:0.001},{},403,"no_approved_model");
  await rejected({...payload,actionKey:"payment.execute"},{},403,"tool_not_trusted");
  await rejected({...payload,padding:"a".repeat(8192)},{},413,"request_too_large");
  await rejected(payload,{headers:{"content-encoding":"gzip"}},415,"unsupported_content_encoding");
  await rejected(payload,{rawBody:"{"},400,"invalid_json");
  await rejected(null,{},400,"invalid_input");
  await rejected([],{},400,"invalid_input");
  await rejected(payload,{method:"GET"},404,"not_found");
  assert.equal(sqlite.prepare("SELECT total_changes() n").get().n,before,"preflight must not persist or execute actions");
  sqlite.prepare("UPDATE memberships SET role='manager'").run();
  assert.equal((await call()).status,200);
  sqlite.prepare("UPDATE memberships SET role='reviewer'").run();
  await rejected(payload,{},403,"forbidden");
  sqlite.prepare("UPDATE memberships SET role='owner',status='inactive'").run();
  await rejected(payload,{},401,"unauthorized");
  sqlite.prepare("UPDATE memberships SET status='active'").run();
  sqlite.prepare("UPDATE users SET session_generation=1").run();
  await rejected(payload,{},401,"unauthorized");
  console.log("agent observation preflight authenticated API: PASS");
}finally{
  sqlite.close();
}
