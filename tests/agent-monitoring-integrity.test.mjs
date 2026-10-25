import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAgentAction } from "../server/agent-action-policy.js";

const context = { tenantId: "tenant-a", actorId: "operator-a", now: 1_800_000_000_000 };
const basePolicy = {
  enabled: true, killSwitch: false, auditAvailable: true,
  allowedActions: ["invoice.draft", "operations.read", "access.change", "record.delete"],
  remainingBudget: 10, estimatedCost: 1
};

test("ordinary agent cannot execute unclassified monitoring mutations even if allowlisted", () => {
  for (const action of ["monitoring.disable", "alerts.suppress", "audit.delete", "audit.configure", "security.policy.update", "agent.kill_switch.disable"]) {
    const policy = { ...basePolicy, allowedActions: [...basePolicy.allowedActions, action] };
    assert.deepEqual(evaluateAgentAction({ action, args: { enabled: false }, context, policy }), {
      allowed: false, reason: "unclassified_action"
    }, action);
  }
});

test("agent cannot repurpose a draft action into a monitoring mutation", () => {
  const result = evaluateAgentAction({
    action: "monitoring.disable", args: { action: "invoice.draft" }, context,
    policy: { ...basePolicy, allowedActions: [...basePolicy.allowedActions, "monitoring.disable"] }
  });
  assert.equal(result.allowed, false);
});

test("missing audit availability fails closed for read and draft actions", () => {
  for (const action of ["invoice.draft", "operations.read"]) {
    const result = evaluateAgentAction({ action, args: {}, context, policy: { ...basePolicy, auditAvailable: false } });
    assert.deepEqual(result, { allowed: false, reason: "governance_unavailable" });
  }
});

test("kill switch fails closed even for otherwise safe actions", () => {
  for (const action of ["invoice.draft", "operations.read"]) {
    const result = evaluateAgentAction({ action, args: {}, context, policy: { ...basePolicy, killSwitch: true } });
    assert.deepEqual(result, { allowed: false, reason: "governance_unavailable" });
  }
});

test("sensitive access and deletion actions require approval", () => {
  for (const action of ["access.change", "record.delete"]) {
    const result = evaluateAgentAction({ action, args: { target: "monitoring-config" }, context, policy: basePolicy });
    assert.deepEqual(result, { allowed: false, reason: "approval_required" });
  }
});
