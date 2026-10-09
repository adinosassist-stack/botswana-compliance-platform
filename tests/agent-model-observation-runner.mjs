import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {runAgentModelObservation} from "../cloudflare/src/agent-model-observation-runner.js";

const db=new DatabaseSync(":memory:");
try{
  db.exec(readFileSync(new URL("../cloudflare/experimental/agent_cost_accounting.sql",import.meta.url),"utf8"));
  db.prepare("INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor,enabled) VALUES('t1','thebe',100,1)").run();
  const DB={
    prepare(sql){let args=[];return {bind(...v){args=v;return this},first(){return db.prepare(sql).get(...args)},run(){return db.prepare(sql).run(...args)}}},
    async batch(statements){db.exec("BEGIN IMMEDIATE");try{const r=statements.map(s=>({meta:{changes:Number(s.run().changes)}}));db.exec("COMMIT");return r}catch(e){db.exec("ROLLBACK");throw e}}
  };
  const model={id:"tested-model",provider:"test",enabled:true,taskClasses:["summary"],estimatedCostUsd:0.01,evalPassRate:0.99,
    externalProcessingApproved:true,maxOutputTokens:10,inputTokenOverhead:10,
    pricing:{inputBwpMinorPerMillion:100000,outputBwpMinorPerMillion:100000}};
  const env={DB,AGENT_MODEL_EXECUTION_ENABLED:"1",AGENT_APPROVED_MODELS_JSON:JSON.stringify([model])};
  const auth={tenant_id:"t1",user_id:"u1",role:"owner"};
  const input={runId:"r1",actionKey:"financial_position.read",taskClass:"summary",budgetUsd:0.1,prompt:"hello"};
  let calls=0;
  const adapters={test:async request=>{
    calls++;
    assert.equal(request.tenantId,"t1");
    assert.equal(request.model,"tested-model");
    assert.equal(request.maxOutputTokens,10);
    assert.equal(db.prepare("SELECT status FROM agent_cost_reservations WHERE run_id=?").get(request.runId).status,"reserved");
    return {text:"candidate summary",usage:{inputTokens:5,outputTokens:5}};
  }};
  const run=(overrides={})=>runAgentModelObservation({env,auth,input,adapters,...overrides});
  const budget=()=>({...db.prepare("SELECT spent_minor,reserved_minor FROM agent_cost_budgets WHERE tenant_id='t1'").get()});
  for(const disabled of [undefined,"0","true"]){
    assert.equal((await run({env:{...env,AGENT_MODEL_EXECUTION_ENABLED:disabled}})).code,"model_execution_disabled");
  }
  assert.equal(calls,0);
  assert.equal((await run({env:{...env,AGENT_RUNTIME_KILL_SWITCH:"1"}})).code,"runtime_kill_switch_active");
  assert.equal((await run({auth:{...auth,role:"reviewer"}})).code,"model_actor_forbidden");
  assert.equal((await run({adapters:{}})).code,"model_adapter_unavailable");
  assert.equal((await run({env:{...env,AGENT_APPROVED_MODELS_JSON:JSON.stringify([{...model,externalProcessingApproved:false}])}})).code,"model_processing_not_approved");
  assert.equal((await run({env:{...env,AGENT_APPROVED_MODELS_JSON:JSON.stringify([{...model,pricing:{}}])}})).code,"model_pricing_invalid");
  assert.equal((await run({input:{...input,models:[model]}})).code,"caller_model_catalog_forbidden");
  assert.equal(calls,0);
  const result=await run({input:{...input,tenantId:"other",actorId:"forged"}});
  assert.equal(result.ok,true);
  assert.equal(result.executionAllowed,false);
  assert.equal(result.outputVerified,false);
  assert.equal(result.costStatus,"settled");
  assert.equal(result.actualCostMinor,1);
  assert.deepEqual(budget(),{spent_minor:1,reserved_minor:0});
  assert.equal((await run()).ok,false);
  assert.equal(calls,1,"duplicate run must never invoke the provider twice");
  const unknown=await run({input:{...input,runId:"unknown"},adapters:{test:async()=>{calls++;return {text:"unaccounted"}}}});
  assert.equal(unknown.code,"model_usage_unavailable");
  assert.equal(unknown.text,undefined);
  assert.deepEqual(budget(),{spent_minor:1,reserved_minor:3});
  const failed=await run({input:{...input,runId:"failed"},adapters:{test:async()=>{calls++;throw Error("secret-provider-detail")}}});
  assert.equal(failed.code,"model_provider_unavailable");
  assert.equal(JSON.stringify(failed).includes("secret-provider-detail"),false);
  assert.deepEqual(budget(),{spent_minor:1,reserved_minor:6});
  db.prepare("UPDATE agent_cost_budgets SET budget_minor=7").run();
  assert.equal((await run({input:{...input,runId:"over-budget"}})).ok,false);
  assert.equal(calls,3);
  db.prepare("UPDATE agent_cost_budgets SET budget_minor=100").run();
  const batch=DB.batch;
  DB.batch=async function(statements){const r=await batch(statements);env.AGENT_RUNTIME_KILL_SWITCH="1";return r};
  const interrupted=await run({input:{...input,runId:"interrupted"}});
  assert.equal(interrupted.code,"runtime_kill_switch_active");
  assert.equal(interrupted.costStatus,"released");
  assert.equal(calls,3,"a kill switch activated during reservation must stop provider dispatch");
  DB.batch=batch;
  delete env.AGENT_RUNTIME_KILL_SWITCH;
  const mutableInput={...input,runId:"snapshot"},mutableAuth={...auth};
  DB.batch=async function(statements){const r=await batch(statements);mutableInput.prompt="changed after admission";mutableAuth.tenant_id="other";return r};
  const snapshot=await run({input:mutableInput,auth:mutableAuth,adapters:{test:async request=>{
    assert.equal(request.prompt,"hello");assert.equal(request.tenantId,"t1");
    return {text:"snapshot",usage:{inputTokens:5,outputTokens:5}};
  }}});
  assert.equal(snapshot.ok,true);
  DB.batch=batch;
  const invalidOutput=await run({input:{...input,runId:"invalid-output"},adapters:{test:async()=>({text:null,usage:{inputTokens:5,outputTokens:5}})}});
  assert.equal(invalidOutput.code,"model_output_invalid");
  assert.equal(invalidOutput.costStatus,"settled","billed work must be accounted even if the output is invalid");
  assert.equal((await run({env:{...env,DB:null},input:{...input,runId:"missing-storage"}})).code,"cost_reservation_invalid");
  const timedOut=await run({env:{...env,AGENT_MODEL_TIMEOUT_MS:1000},input:{...input,runId:"timeout"},adapters:{test:request=>new Promise(resolve=>request.signal.addEventListener("abort",()=>resolve({}),{once:true}))}});
  assert.equal(timedOut.ok,false);
  assert.equal(timedOut.costStatus,"reconciliation_required");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_cost_reservations WHERE tenant_id<>'t1'").get().n,0);
  console.log("governed model observation reservation, usage and failure lifecycle: PASS");
}finally{db.close()}
