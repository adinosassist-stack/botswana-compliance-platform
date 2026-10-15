import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {adaptShadowCostEvent,loadReliabilityAdvisorSummary} from "../cloudflare/src/agent-reliability-telemetry-adapter.js";
import {AGENT_COST_TELEMETRY_VERSION} from "../cloudflare/src/agent-cost-outcome-telemetry.js";

const migration=readFileSync(new URL("../cloudflare/migrations/045_v80_agentic_foundation.sql",import.meta.url),"utf8");
const eventsSchema=migration.match(/CREATE TABLE IF NOT EXISTS agentic_events\([\s\S]*?\n\);/)?.[0]||"";
assert.match(eventsSchema,/occurred_at\s+TEXT\s+NOT NULL/);
assert.doesNotMatch(eventsSchema,/\bcreated_at\b/);

const event={version:AGENT_COST_TELEMETRY_VERSION,telemetryMode:"shadow",tenantId:"tenant-A",runId:"run-1",source:"reconciliation",usage:{inputTokens:10,outputTokens:4},cost:{state:"verified",amountMinor:12},prompt:"private"};
assert.equal(adaptShadowCostEvent(event,"tenant-B"),null);
assert.equal(adaptShadowCostEvent(event,"tenant-A").outcome,"unverified");
assert.equal(adaptShadowCostEvent(event,"tenant-A").prompt,undefined);
const db={prepare(sql){
  assert.match(sql,/tenant_id=\?/);
  assert.match(sql,/occurred_at>=datetime\('now',\?\)/);
  assert.match(sql,/ORDER BY occurred_at DESC/);
  assert.doesNotMatch(sql,/\bcreated_at\b/);
  return {bind(tenant){assert.equal(tenant,"tenant-A");return {async all(){return {results:[{detail_json:JSON.stringify(event)},{detail_json:JSON.stringify(event)},{detail_json:"{bad"},{detail_json:"x".repeat(32769)},{detail_json:JSON.stringify({...event,tenantId:"tenant-B"})}]}}}}}
}};
assert.equal(adaptShadowCostEvent(JSON.parse(JSON.stringify(event)),"tenant-A")?.traceId,"run-1");
const result=await loadReliabilityAdvisorSummary({DB:db},"tenant-A");
assert.equal(result.available,true);
assert.equal(result.summary.total,1,JSON.stringify(result));
assert.equal(result.summary.counts.unverified,1);
assert.equal(result.canMutate,false);
assert.equal((await loadReliabilityAdvisorSummary({DB:db},"../unsafe")).available,false);
console.log("advisor telemetry adapter tests passed");