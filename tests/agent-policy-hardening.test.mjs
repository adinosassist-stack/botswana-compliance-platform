import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAgentAction, SAFE_AGENT_ACTIONS, agentArgumentDigest } from "../server/agent-action-policy.js";

const context = { tenantId: "tenant-a", actorId: "owner-a", now: Date.now() };
const policy = { enabled: true, killSwitch: false, auditAvailable: true, allowedActions: ["invoice.draft", "money.transfer", "unclassified.action"], remainingBudget: 10, estimatedCost: 1 };

test("unclassified action fails closed even when allowlisted", () => {
  assert.equal(evaluateAgentAction({ action: "unclassified.action", args: {}, context, policy }).reason, "unclassified_action");
});
test("safe action catalogue contains no money movement", () => {
  assert.ok(SAFE_AGENT_ACTIONS.includes("invoice.draft"));
  assert.ok(!SAFE_AGENT_ACTIONS.includes("money.transfer"));
});
test("missing trusted clock denies", () => {
  assert.equal(evaluateAgentAction({ action: "invoice.draft", args: {}, context: { tenantId: "tenant-a", actorId: "owner-a" }, policy }).reason, "invalid_server_time");
});
test("draft actions still require tenant identity and spend budget", () => {
  assert.equal(evaluateAgentAction({ action: "invoice.draft", args: {}, context: { actorId: "owner-a", now: Date.now() }, policy }).allowed, false);
  assert.equal(evaluateAgentAction({ action: "invoice.draft", args: {}, context, policy: { ...policy, remainingBudget: 0 } }).allowed, false);
});

test("argument digest is stable across key order", () => {
  assert.equal(agentArgumentDigest({ b: 2, a: 1 }), agentArgumentDigest({ a: 1, b: 2 }));
});
test("non-JSON agent arguments cannot be hashed", () => {
  for (const value of [{ amount: undefined }, { amount: NaN }, { amount: Infinity }, { amount: BigInt(1) }, new Date()]) {
    assert.throws(() => agentArgumentDigest(value), /non_json_argument/);
  }
});
