import assert from "node:assert/strict";
import fs from "node:fs";
import {createHmac} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import worker from "../cloudflare/src/worker.js";
import {handleAgenticRequest} from "../cloudflare/src/agentic-core.js";

const sqlite=new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8"));
for(const migration of ["044_v79_finance_reconciliation.sql","049_v108_finance_receivables.sql"]){
  sqlite.exec(fs.readFileSync(new URL(`../cloudflare/migrations/${migration}`,import.meta.url),"utf8"));
}
const DB={prepare(sql){let args=[];return {
  bind(...values){args=values;return this},
  async first(){return sqlite.prepare(sql).get(...args)||null},
  async all(){return {results:sqlite.prepare(sql).all(...args)}},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}
}},async batch(statements){
  sqlite.exec("BEGIN IMMEDIATE");
  try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results}
  catch(error){sqlite.exec("ROLLBACK");throw error}
}};
const secret="test-only-session-secret-32-characters",session="test-owner-session",csrf="test-csrf";
sqlite.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("tenant-1","Test workspace");
sqlite.prepare("INSERT INTO users(id,email) VALUES(?,?)").run("owner-1","owner@example.com");
sqlite.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)").run("tenant-1","owner-1","owner","active");
sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(createHmac("sha256",secret).update(session).digest("hex"),"owner-1","tenant-1","owner",csrf);
sqlite.prepare("INSERT INTO subscriptions(tenant_id,plan,status) VALUES(?,?,?)").run("tenant-1","business","active");
sqlite.prepare("INSERT INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,?,?)").run("tenant-1",100,40);
sqlite.prepare("INSERT INTO app_state(tenant_id,version,state_json) VALUES(?,?,?)").run("tenant-1",1,JSON.stringify({activeCompanyId:"company-1",companies:[{id:"company-1",profile:{industry:"Retail"}}]}));
sqlite.prepare("INSERT INTO business_risk_events(id,tenant_id,event_key,category,severity,source_type,title,rationale,recommended_action,status) VALUES(?,?,?,?,?,?,?,?,?,?)").run("risk-1","tenant-1","test-risk","corporate","high","test","Recorded issue","Follow up required","Review this issue","open");

let providerCalls=0;
const env={DB,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:"test-only-audit-secret-32-characters",PUBLIC_ORIGIN:"https://app.example",AI:{async run(model,input){
  providerCalls++;
  assert.match(input.prompt,/Recorded issue/,"actual advisor must assemble workspace records");
  assert.match(input.prompt,/LANGUAGE_POLICY/,"language policy must be built by the actual advisor");
  return {response:JSON.stringify({answer:"Review the recorded issue.",confidence:"high",actions:[{title:"Review the recorded issue",reason:"An issue is recorded.",priority:"high",sourceRefs:["RISK-1","invented-ref"]}],caveats:[],sourceRefs:["RISK-1"]})};
}}};
function request(path,goal){return new Request(`https://app.example${path}`,{method:"POST",headers:{cookie:`__Host-bw_session=${session}`,origin:"https://app.example","x-csrf-token":csrf,"content-type":"application/json"},body:JSON.stringify(goal?{goal}:{})})}
try{
  const coreFetch=(req,innerEnv,ctx)=>worker.fetch(req,innerEnv,ctx);
  let response=await handleAgenticRequest({request:request("/api/agentic/plan","Review cash and compliance. ".repeat(30).slice(0,500)),env,ctx:{},coreFetch});
  let result=await response.json();
  assert.equal(response.status,201,JSON.stringify(result));
  assert.equal(providerCalls,1,"planner must reach the actual advisor and AI provider boundary");
  assert.equal(result.run.generationMode,"governed_ai_advisor");
  assert.deepEqual(result.proposals[0].sourceRefs,["RISK-1"]);
  assert.equal(result.proposals[0].verification.claimsVerified,false);
  assert.equal(result.run.confidence,"low","unverified claims cannot carry a high-confidence plan badge");
  assert.equal(sqlite.prepare("SELECT balance FROM ai_credit_wallets WHERE tenant_id='tenant-1'").get().balance,94);
  const runId=result.run.id;
  response=await handleAgenticRequest({request:new Request(`https://app.example/api/agentic/runs/${runId}/continuation`,{headers:{cookie:`__Host-bw_session=${session}`}}),env,ctx:{},coreFetch});
  result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.synthesized,false,"continuation must load the atomically persisted checkpoint");
  response=await handleAgenticRequest({request:request(`/api/agentic/runs/${runId}/continue`),env,ctx:{},coreFetch});
  result=await response.json();
  assert.equal(response.status,201,JSON.stringify(result));
  assert.equal(providerCalls,2,"continuations must also reach the real advisor");
  assert.equal(result.run.generationMode,"governed_ai_advisor");
  env.AI=undefined;
  response=await handleAgenticRequest({request:request("/api/agentic/plan","Review recorded issues"),env,ctx:{},coreFetch});
  result=await response.json();
  assert.equal(response.status,201);
  assert.equal(result.run.generationMode,"deterministic_fallback","provider-free responses must not be labelled AI-generated");
  sqlite.prepare("UPDATE agentic_events SET detail_json=json_set(detail_json,'$.checkpoint.summary','tampered') WHERE run_id=? AND event_type='PLAN_GENERATED'").run(runId);
  response=await handleAgenticRequest({request:request(`/api/agentic/runs/${runId}/continue`),env,ctx:{},coreFetch});
  result=await response.json();
  assert.equal(response.status,409,"tampered persisted checkpoints must fail closed");
  assert.equal(result.error,"agentic_checkpoint_invalid");
  assert.equal(providerCalls,2);
  console.log("AI planner/advisor SQLite integration: PASS");
}finally{sqlite.close()}
