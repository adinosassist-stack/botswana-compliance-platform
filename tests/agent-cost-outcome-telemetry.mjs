import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {
  AGENT_COST_TELEMETRY_EVENT,
  buildAgentCostOutcomeTelemetry,
  recordAgentCostOutcomeTelemetry,
  loadAgentCostOutcomeSummary
} from "../cloudflare/src/agent-cost-outcome-telemetry.js";

const base={tenantId:"t1",actorTenantId:"t1",runId:"r1",provider:"provider-a",model:"model-a"};

const unknown=buildAgentCostOutcomeTelemetry(base);
assert.equal(unknown.ok,true);
assert.equal(unknown.usage.state,"unknown");
assert.equal(unknown.usage.inputTokens,null);
assert.equal(unknown.usage.outputTokens,null);
assert.equal(unknown.cost.state,"unknown");
assert.equal(unknown.cost.amountMinor,null);
assert.equal(unknown.budgetEnforcement,false);
assert.equal(unknown.executionAuthorityEffect,"none");

const explicitZero=buildAgentCostOutcomeTelemetry({...base,inputTokens:0,outputTokens:0,pricing:{inputBwpMinorPerMillion:200,outputBwpMinorPerMillion:400}});
assert.equal(explicitZero.usage.state,"known");
assert.equal(explicitZero.cost.state,"estimated");
assert.equal(explicitZero.cost.amountMinor,0);

const estimated=buildAgentCostOutcomeTelemetry({...base,inputTokens:500_000,outputTokens:250_000,pricing:{inputBwpMinorPerMillion:200,outputBwpMinorPerMillion:400},durationMs:1500,retryCount:2,fallbackFromProvider:"provider-z",estimatedValueMinor:500});
assert.equal(estimated.cost.state,"estimated");
assert.equal(estimated.cost.amountMinor,200);
assert.equal(estimated.provider.fallbackUsed,true);
assert.equal(estimated.provider.fallbackFrom,"provider-z");
assert.equal(estimated.runtime.retryCount,2);
assert.equal(estimated.value.state,"estimated");
assert.equal(estimated.roi.state,"estimated");
assert.equal(estimated.roi.percent,150);

const verified=buildAgentCostOutcomeTelemetry({...base,inputTokens:500_000,outputTokens:250_000,pricing:{inputBwpMinorPerMillion:200,outputBwpMinorPerMillion:400},verifiedCostMinor:123,verifiedValueMinor:246});
assert.equal(verified.cost.state,"verified");
assert.equal(verified.cost.amountMinor,123);
assert.equal(verified.cost.estimatedAmountMinor,200);
assert.equal(verified.cost.verifiedAmountMinor,123);
assert.equal(verified.value.state,"verified");
assert.equal(verified.roi.state,"verified");
assert.equal(verified.roi.percent,100);

assert.equal(buildAgentCostOutcomeTelemetry({...base,inputTokens:1}).code,"cost_usage_partial");
assert.equal(buildAgentCostOutcomeTelemetry({...base,inputTokens:-1,outputTokens:0}).code,"cost_usage_invalid");
assert.equal(buildAgentCostOutcomeTelemetry({...base,inputTokens:1,outputTokens:1,pricing:{inputBwpMinorPerMillion:1}}).code,"cost_pricing_invalid");
assert.equal(buildAgentCostOutcomeTelemetry({...base,verifiedCostMinor:-1}).code,"cost_verified_amount_invalid");
assert.equal(buildAgentCostOutcomeTelemetry({...base,durationMs:86_400_001}).code,"cost_duration_invalid");
assert.equal(buildAgentCostOutcomeTelemetry({...base,retryCount:101}).code,"cost_retry_count_invalid");
assert.equal(buildAgentCostOutcomeTelemetry({...base,actorTenantId:"t2"}).code,"cost_telemetry_tenant_mismatch");
assert.equal(buildAgentCostOutcomeTelemetry({...base,runId:" "}).code,"cost_telemetry_run_required");
assert.equal(buildAgentCostOutcomeTelemetry({...base,outcomeId:42}).code,"cost_telemetry_outcome_invalid");

const db=new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE agentic_runs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL);
CREATE TABLE agentic_outcomes(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,run_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE agentic_events(
  id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,run_id TEXT NOT NULL,proposal_id TEXT,event_type TEXT NOT NULL,
  actor_user_id TEXT,detail_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO agentic_runs(id,tenant_id) VALUES('r1','t1'),('r2','t1'),('other-run','t2');
INSERT INTO agentic_outcomes(id,tenant_id,run_id) VALUES('o1','t1','r1');
`);
const env={DB:{
  prepare(sql){let values=[];return {
    bind(...v){values=v;return this},
    first(){return db.prepare(sql).get(...values)},
    all(){return {results:db.prepare(sql).all(...values)}},
    run(){const result=db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}}
  }}
}};

assert.equal((await recordAgentCostOutcomeTelemetry(env,{...base,runId:"missing"})).code,"cost_telemetry_run_not_found");
assert.equal((await recordAgentCostOutcomeTelemetry(env,{...base,outcomeId:"missing"})).code,"cost_telemetry_outcome_not_found");
assert.equal((await recordAgentCostOutcomeTelemetry(env,{...base,actorTenantId:"t2"})).code,"cost_telemetry_tenant_mismatch");

const first=await recordAgentCostOutcomeTelemetry(env,{...base,outcomeId:"o1",durationMs:1000,retryCount:1,prompt:"secret prompt",credentials:"secret"});
assert.equal(first.ok,true);
assert.equal(first.code,"cost_outcome_shadow_recorded");
const second=await recordAgentCostOutcomeTelemetry(env,{...base,runId:"r2",provider:"provider-b",model:"model-b",inputTokens:500_000,outputTokens:250_000,pricing:{inputBwpMinorPerMillion:200,outputBwpMinorPerMillion:400},verifiedCostMinor:250,durationMs:2000,retryCount:2,fallbackFromProvider:"provider-a"});
assert.equal(second.ok,true);

const stored=db.prepare("SELECT event_type,detail_json FROM agentic_events ORDER BY created_at,id").all();
assert.equal(stored.length,2);
assert.ok(stored.every(row=>row.event_type===AGENT_COST_TELEMETRY_EVENT));
assert.ok(stored.every(row=>!row.detail_json.includes("secret prompt")&&!row.detail_json.includes("credentials")));
assert.ok(stored.every(row=>JSON.parse(row.detail_json).executionAuthorityEffect==="none"));
assert.ok(stored.every(row=>JSON.parse(row.detail_json).budgetEnforcement===false));

const summary=await loadAgentCostOutcomeSummary(env,"t1");
assert.equal(summary.available,true);
assert.equal(summary.mode,"shadow");
assert.equal(summary.events,2);
assert.deepEqual(summary.usage,{known:1,unknown:1,missingMeansZero:false});
assert.equal(summary.spend.currency,"BWP");
assert.equal(summary.spend.metered,false);
assert.equal(summary.spend.budgetEnforcement,false);
assert.equal(summary.spend.verifiedCostMinor,250);
assert.equal(summary.spend.unknownCostEvents,1);
assert.equal(summary.spend.aggregateActualMinor,null);
assert.equal(summary.runtime.totalDurationMs,3000);
assert.equal(summary.runtime.totalRetries,3);
assert.equal(summary.runtime.providerFallbacks,1);
assert.deepEqual(summary.providers.observed,["provider-a","provider-b"]);
assert.equal(summary.outcomes.linkedEvents,1);
assert.equal(summary.telemetryCanMutate,false);
assert.equal(summary.telemetryCanGrantAuthority,false);

const t2=await loadAgentCostOutcomeSummary(env,"t2");
assert.equal(t2.events,0);
assert.equal(t2.spend.aggregateActualMinor,null);
console.log("Agent cost-to-outcome shadow telemetry tests passed");
