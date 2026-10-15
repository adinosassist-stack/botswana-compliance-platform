import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAgentAction, SAFE_AGENT_ACTIONS } from "../server/agent-action-policy.js";

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
  assert.equal(evaluateAgentAction({ action: "invoice.draft", args: {}, context: { tenantId: "tenant-a", actorId: "owner-a" }, policy }).allowed, false);
});
test("draft actions still require tenant identity and spend budget", () => {
  assert.equal(evaluateAgentAction({ action: "invoice.draft", args: {}, context: { actorId: "owner-a", now: Date.now() }, policy }).allowed, false);
  assert.equal(evaluateAgentAction({ action: "invoice.draft", args: {}, context, policy: { ...policy, remainingBudget: 0 } }).allowed, false);
});
