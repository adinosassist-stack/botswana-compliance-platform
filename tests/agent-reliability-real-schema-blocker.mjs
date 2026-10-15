import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {AGENT_COST_TELEMETRY_EVENT,recordAgentCostOutcomeTelemetry} from "../cloudflare/src/agent-cost-outcome-telemetry.js";
import {loadReliabilityAdvisorSummary} from "../cloudflare/src/agent-reliability-telemetry-adapter.js";
import {handleReliabilityAdvisorRequest} from "../cloudflare/src/agent-reliability-api.js";
import {installShadowTelemetrySchema,seedShadowTelemetryFixtures,sqliteTelemetryEnv} from "./helpers/agent-shadow-telemetry.mjs";

const db=new DatabaseSync(":memory:");
try{
  installShadowTelemetrySchema(db);
  seedShadowTelemetryFixtures(db);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys,1);
  // Forward migration is idempotent without widening governed event types.
  db.exec(readFileSync("cloudflare/migrations/069_agent_cost_shadow_events.sql","utf8"));
  assert.throws(()=>db.prepare("INSERT INTO agentic_events(id,tenant_id,run_id,event_type,actor_user_id,detail_json) VALUES(?,?,?,?,?,?)")
    .run("old-event","t1","r1",AGENT_COST_TELEMETRY_EVENT,"u1","{}"),/CHECK constraint failed/);
  const env=sqliteTelemetryEnv(db);
  const input={tenantId:"t1",actorTenantId:"t1",actorUserId:"u1",runId:"r1",outcomeId:"o1",verifiedCostMinor:10};
  assert.equal((await recordAgentCostOutcomeTelemetry(env,input)).ok,true);
  assert.equal((await recordAgentCostOutcomeTelemetry(env,{...input,actorTenantId:"t2"})).code,"cost_telemetry_tenant_mismatch");
  assert.equal((await recordAgentCostOutcomeTelemetry(env,{...input,runId:"other-run"})).code,"cost_telemetry_run_not_found");
  assert.equal((await recordAgentCostOutcomeTelemetry(env,{...input,actorUserId:"missing"})).code,"cost_telemetry_write_failed");
  assert.equal((await recordAgentCostOutcomeTelemetry(env,{...input,actorUserId:null})).code,"cost_telemetry_write_failed");
  assert.equal(db.prepare("SELECT count(*) n FROM agent_cost_shadow_events").get().n,1,"rejected writes must not create telemetry");
  const own=await loadReliabilityAdvisorSummary(env,"t1");
  assert.equal(own.available,true);
  assert.equal(own.summary.total,1);
  assert.equal(own.summary.knownCostMinor,10);
  assert.equal(own.summary.counts.success,0,"linked outcomes and cost do not establish verified task success");
  assert.equal(own.summary.counts.unverified,1);
  assert.equal(own.canMutate,false);
  assert.equal(own.executionAuthorityEffect,"none");
  assert.equal((await loadReliabilityAdvisorSummary(env,"t2")).summary.total,0);
  const request=new Request("https://thebe.example/api/ai/operator/reliability");
  const owner={tenant_id:"t1",role:"owner"};
  assert.equal((await handleReliabilityAdvisorRequest(request,{auth:owner,env})).status,404);
  const enabled={...env,THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED:"true"};
  assert.equal((await handleReliabilityAdvisorRequest(request,{env:enabled})).status,401);
  assert.equal((await handleReliabilityAdvisorRequest(request,{auth:{...owner,role:"manager"},env:enabled})).status,403);
  const response=await handleReliabilityAdvisorRequest(request,{auth:owner,env:enabled});
  assert.equal(response.status,200);
  assert.equal((await response.json()).summary.total,1);
  const other=await handleReliabilityAdvisorRequest(request,{auth:{tenant_id:"t2",role:"owner"},env:enabled});
  assert.equal((await other.json()).summary.total,0);
  db.exec("DROP TABLE agent_cost_shadow_events");
  assert.equal((await handleReliabilityAdvisorRequest(request,{auth:owner,env:enabled})).status,503,"missing telemetry schema must fail closed");
  assert.equal((await recordAgentCostOutcomeTelemetry(env,input)).code,"cost_telemetry_write_failed");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  console.log("Reliability writer-to-adapter-to-owner API passes with the full production schema/migration chain, foreign keys, tenant isolation and fail-closed storage.");
}finally{db.close();}
