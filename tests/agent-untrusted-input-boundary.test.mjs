import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAgentAction, agentArgumentDigest } from "../server/agent-action-policy.js";

const now = Date.now();
const context = { tenantId: "tenant-a", actorId: "owner-a", now };
const policy = { enabled: true, killSwitch: false, auditAvailable: true, allowedActions: ["money.transfer"], remainingBudget: 10, estimatedCost: 1 };
const args = { amount: 100, currency: "BWP", destination: "synthetic-only" };
const approval = { id: "human-approval", nonce: "nonce-1", consumed: false, status: "approved", tenantId: context.tenantId, actorId: context.actorId, action: "money.transfer", argumentDigest: agentArgumentDigest(args), expiresAt: now + 60000 };

for (const value of ["external-document", "third-party-message", "tool-response", "retrieved-web-content"]) {
  test("untrusted content requires approval: " + value, () => {
    const result = evaluateAgentAction({ action: "money.transfer", args: { ...args, untrustedSource: value }, context, policy, approval: null });
    assert.equal(result.reason, "approval_required");
  });
}
test("altered arguments cannot reuse approval", () => {
  assert.equal(evaluateAgentAction({ action: "money.transfer", args: { ...args, untrustedSource: "external-document" }, context, policy, approval }).reason, "approval_scope_mismatch");
});
test("different tenant cannot reuse approval", () => {
  assert.equal(evaluateAgentAction({ action: "money.transfer", args, context: { ...context, tenantId: "tenant-b" }, policy, approval }).reason, "approval_scope_mismatch");
});
