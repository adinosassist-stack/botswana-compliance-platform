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

test("cyclic agent arguments fail with controlled validation error", () => {
  const cycle = { amount: 1 };
  cycle.self = cycle;
  assert.throws(() => agentArgumentDigest(cycle), /non_json_argument/);
  const array = [];
  array.push(array);
  assert.throws(() => agentArgumentDigest(array), /non_json_argument/);
});

test("accessor and symbol-bearing arguments are rejected without executing getter", () => {
  let accessed = false;
  const getter = {};
  Object.defineProperty(getter, "amount", { enumerable: true, get() { accessed = true; return 1; } });
  assert.throws(() => agentArgumentDigest(getter), /non_json_argument/);
  assert.equal(accessed, false);
  const symbol = { amount: 1, [Symbol("hidden")]: "secret" };
  assert.throws(() => agentArgumentDigest(symbol), /non_json_argument/);
});

test("array extra properties and accessor indices cannot bypass digest validation", () => {
  const extra = [1, 2];
  extra.hidden = "ignored-by-json";
  assert.throws(() => agentArgumentDigest(extra), /non_json_argument/);
  let accessed = false;
  const accessor = [1];
  Object.defineProperty(accessor, "0", { enumerable: true, get() { accessed = true; return 9; } });
  assert.throws(() => agentArgumentDigest(accessor), /non_json_argument/);
  assert.equal(accessed, false);
});

test("sparse and subclassed arrays cannot be authorized", () => {
  const sparse = [];
  sparse.length = 2;
  sparse[0] = "one";
  assert.throws(() => agentArgumentDigest(sparse), /non_json_argument/);
  class CustomArray extends Array {}
  assert.throws(() => agentArgumentDigest(new CustomArray(1, 2)), /non_json_argument/);
});

test("agent argument digest enforces UTF-8 byte limit", () => {
  assert.throws(() => agentArgumentDigest({ text: "x".repeat(70_000) }), /agent_arguments_too_large/);
  assert.throws(() => agentArgumentDigest({ text: "🦓".repeat(17_000) }), /agent_arguments_too_large/);
  assert.match(agentArgumentDigest({ text: "x".repeat(100) }), /^[a-f0-9]{64}$/);
});

test("deeply nested agent arguments fail with controlled validation error", () => {
  let deep = "leaf";
  for (let i = 0; i < 40; i++) deep = { next: deep };
  assert.throws(() => agentArgumentDigest(deep), /agent_arguments_too_deep/);
  assert.match(agentArgumentDigest({ nested: { value: 1 } }), /^[a-f0-9]{64}$/);
});

test("ordinary multi-element arrays retain valid numeric indices", () => {
  assert.match(agentArgumentDigest({ entries: [10, 20, 30] }), /^[a-f0-9]{64}$/);
});

test("null-prototype JSON maps are canonicalized like ordinary objects", () => {
  const map = Object.create(null);
  map.amount = 12;
  map.currency = "BWP";
  assert.equal(agentArgumentDigest(map), agentArgumentDigest({ amount: 12, currency: "BWP" }));
});

test("pure policy rejects non-string and whitespace identities", () => {
  for (const tenantId of [42, {}, " "]) {
    const result = evaluateAgentAction({ action: "invoice.draft", args: {}, context: { ...context, tenantId }, policy });
    assert.deepEqual(result, { allowed: false, reason: "unauthorized_action" });
  }
  for (const actorId of [42, {}, " "]) {
    const result = evaluateAgentAction({ action: "invoice.draft", args: {}, context: { ...context, actorId }, policy });
    assert.deepEqual(result, { allowed: false, reason: "unauthorized_action" });
  }
});
