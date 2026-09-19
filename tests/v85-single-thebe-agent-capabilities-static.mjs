import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AGENT_ACTION_CATALOG,
  THEBE_AGENTS,
  THEBE_CAPABILITIES,
  agentCanRouteAction,
  evaluateAgentAction,
  listPhase1AgentActions,
  resolveAgentKey
} from "../cloudflare/src/agent-policy.js";

assert.deepEqual(Object.keys(THEBE_AGENTS),["thebe"],"Thebe must expose exactly one canonical agent identity");
assert.equal(THEBE_AGENTS.thebe.label,"Thebe");
assert.deepEqual(Object.keys(THEBE_CAPABILITIES).sort(),["compliance","customer","finance","operations"]);
assert.equal(THEBE_CAPABILITIES.customer.enabled,false,"customer/receivables stays reserved until authoritative controls exist");

for(const [key,definition] of Object.entries(AGENT_ACTION_CATALOG)){
  assert.deepEqual(definition.agents,["thebe"],`${key} must route through the canonical Thebe agent`);
}

assert.equal(AGENT_ACTION_CATALOG["tender_readiness.read"].capability,"compliance","tender readiness is a compliance capability, not a separate agent");
assert.equal(AGENT_ACTION_CATALOG["tender_pack.prepare"].capability,"compliance");
assert.equal(AGENT_ACTION_CATALOG["financial_position.read"].capability,"finance");
assert.equal(AGENT_ACTION_CATALOG["daily_operations_summary.read"].capability,"operations");

for(const legacy of ["management","compliance","tender","operations","finance"]){
  assert.equal(resolveAgentKey(legacy),"thebe",`${legacy} must resolve only as a compatibility alias`);
}
assert.equal(resolveAgentKey("thebe"),"thebe");
assert.equal(resolveAgentKey("unknown"),null);

assert.equal(agentCanRouteAction("finance",AGENT_ACTION_CATALOG["financial_position.read"]),true);
assert.equal(agentCanRouteAction("finance",AGENT_ACTION_CATALOG["compliance_status.read"]),false,"legacy aliases must not broaden historical domain access");
assert.equal(agentCanRouteAction("tender",AGENT_ACTION_CATALOG["tender_readiness.read"]),true);
assert.equal(agentCanRouteAction("management",AGENT_ACTION_CATALOG["financial_position.read"]),false);

let decision=evaluateAgentAction({
  agentKey:"thebe",
  actionKey:"financial_position.read",
  actorRole:"owner",
  tenantScoped:true
});
assert.equal(decision.allowed,true);
assert.equal(decision.agentKey,"thebe");
assert.equal(decision.capability,"finance");

decision=evaluateAgentAction({
  agentKey:"finance",
  actionKey:"compliance_status.read",
  actorRole:"owner",
  tenantScoped:true
});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"agent_action_mismatch");

decision=evaluateAgentAction({
  agentKey:"thebe",
  actionKey:"business_health.read",
  actorRole:"reviewer",
  tenantScoped:true
});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"role_forbidden");

decision=evaluateAgentAction({
  agentKey:"thebe",
  actionKey:"payment.execute",
  actorRole:"owner",
  tenantScoped:true,
  strongAuth:true,
  approvalState:"approved"
});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"action_not_enabled","single-agent routing must not enable high-risk actions");

const ownerActions=listPhase1AgentActions("thebe","owner").map(x=>x.key);
for(const key of ["business_health.read","compliance_status.read","tender_readiness.read","daily_operations_summary.read","financial_position.read"]){
  assert.ok(ownerActions.includes(key),`canonical Thebe should route ${key}`);
}

const legacyFinanceActions=listPhase1AgentActions("finance","owner");
assert.ok(legacyFinanceActions.length>0);
assert.ok(legacyFinanceActions.every(x=>x.legacyAgents.includes("finance")),"legacy finance alias must stay bounded to its historical capability");

const authoritySource=fs.readFileSync("cloudflare/src/agentic-authority-core.js","utf8");
assert.match(authoritySource,/agent_key='thebe' AND action_key=\?/,"new canonical delegations must be de-duplicated without collapsing legacy grants");
assert.match(authoritySource,/agent_key IN \('thebe',\?\) AND action_key=\?/,"legacy requests may inherit only their own legacy grant or a canonical Thebe grant");
assert.doesNotMatch(authoritySource,/WHERE tenant_id=\? AND action_key=\? AND status='active'/,"delegation lookup must never ignore the agent compatibility boundary");

console.log("v85 single Thebe agent capability architecture checks passed");
