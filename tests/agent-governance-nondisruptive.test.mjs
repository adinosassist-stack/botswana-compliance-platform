import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAgentAction, agentArgumentDigest, SENSITIVE_AGENT_ACTIONS } from "../server/agent-action-policy.js";

const now = Date.now();
const context = { tenantId: "tenant-a", actorId: "owner-a", now };
const args = { amount: 100, currency: "BWP", destination: "test-only" };
const policy = { enabled: true, killSwitch: false, auditAvailable: true, allowedActions: [...SENSITIVE_AGENT_ACTIONS], remainingBudget: 10, estimatedCost: 1 };
const approval = { id: "test-approval", nonce: "test-nonce", consumed: false, status: "approved", tenantId: context.tenantId, actorId: context.actorId, action: "money.transfer", argumentDigest: agentArgumentDigest(args), expiresAt: now + 60000 };
const evaluate = (overrides = {}) => evaluateAgentAction({ action: "money.transfer", args, context, approval, policy, ...overrides });

test("every sensitive action denies without human approval", () => {
  for (const action of SENSITIVE_AGENT_ACTIONS) {
    assert.equal(evaluate({ action, approval: null }).allowed, false, action);
  }
});
test("cross-tenant and cross-actor approval reuse is rejected", () => {
  assert.equal(evaluate({ context: { ...context, tenantId: "tenant-b" } }).reason, "approval_scope_mismatch");
  assert.equal(evaluate({ context: { ...context, actorId: "manager-b" } }).reason, "approval_scope_mismatch");
});
test("changed transaction arguments invalidate approval", () => {
  assert.equal(evaluate({ args: { ...args, amount: 101 } }).reason, "approval_scope_mismatch");
});
test("expired, consumed and pending approvals deny", () => {
  assert.equal(evaluate({ approval: { ...approval, expiresAt: now } }).reason, "approval_expired");
  assert.equal(evaluate({ approval: { ...approval, consumed: true } }).reason, "approval_required");
  assert.equal(evaluate({ approval: { ...approval, status: "pending" } }).reason, "approval_required");
});
test("kill switch and audit outage fail closed", () => {
  assert.equal(evaluate({ policy: { ...policy, killSwitch: true } }).reason, "governance_unavailable");
  assert.equal(evaluate({ policy: { ...policy, auditAvailable: false } }).reason, "governance_unavailable");
});
test("budget exhaustion and unknown actions deny", () => {
  assert.equal(evaluate({ policy: { ...policy, remainingBudget: 0, estimatedCost: 1 } }).reason, "budget_exceeded");
  assert.equal(evaluate({ action: "unclassified.action", policy: { ...policy, allowedActions: [...policy.allowedActions, "unclassified.action"] } }).reason, "unclassified_action");
});
test("valid approval is only provisional pending atomic consumption", () => {
  assert.deepEqual(evaluate(), { allowed: true, reason: "approval_valid_requires_atomic_consumption" });
});
