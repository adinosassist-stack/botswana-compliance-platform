import assert from "node:assert/strict";
import { test } from "node:test";
import { agentArgumentDigest, evaluateAgentAction } from "../server/agent-action-policy.js";

const args = { amount: 200, destination: "invoice-1" };
const context = { tenantId: "tenant-a", actorId: "owner-a", now: 1000 };
const policy = { enabled: true, killSwitch: false, auditAvailable: true, allowedActions: ["money.transfer", "invoice.draft"], remainingBudget: 10, estimatedCost: 1 };
const approval = { id: "approval-1", nonce: "unique-1", consumed: false, status: "approved", tenantId: "tenant-a", actorId: "owner-a", action: "money.transfer", argumentDigest: agentArgumentDigest(args), expiresAt: 2000 };
const decide = (changes = {}) => evaluateAgentAction({ action: "money.transfer", args, context, approval, policy, ...changes });

test("valid approval still requires atomic consumption", () => assert.equal(decide().reason, "approval_valid_requires_atomic_consumption"));
test("deny missing approval", () => assert.equal(decide({ approval: null }).allowed, false));
test("deny replayed approval", () => assert.equal(decide({ approval: { ...approval, consumed: true } }).allowed, false));
test("deny expired approval", () => assert.equal(decide({ context: { ...context, now: 2000 } }).allowed, false));
test("deny cross-tenant approval", () => assert.equal(decide({ context: { ...context, tenantId: "tenant-b" } }).allowed, false));
test("deny altered tool arguments", () => assert.equal(decide({ args: { ...args, amount: 300 } }).allowed, false));
test("deny emergency shutdown", () => assert.equal(decide({ policy: { ...policy, killSwitch: true } }).allowed, false));
test("deny missing audit store", () => assert.equal(decide({ policy: { ...policy, auditAvailable: false } }).allowed, false));
test("deny over budget", () => assert.equal(decide({ policy: { ...policy, estimatedCost: 11 } }).allowed, false));
test("deny non-allowlisted tools", () => assert.equal(decide({ action: "unknown.execute" }).allowed, false));
test("canonical argument hash ignores key order", () => assert.equal(agentArgumentDigest({ a: 1, b: 2 }), agentArgumentDigest({ b: 2, a: 1 })));
test("allow approved drafting without financial execution", () => assert.equal(decide({ action: "invoice.draft", approval: null }).allowed, true));
