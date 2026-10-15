import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeAgentExecution } from "../server/agent-execution-authorization.js";
import { agentArgumentDigest } from "../server/agent-action-policy.js";

const args = { amount: 120 };
const context = { tenantId: "t1", actorId: "a1", now: 1000 };
const policy = { enabled: true, killSwitch: false, auditAvailable: true, allowedActions: ["money.transfer"], remainingBudget: 2, estimatedCost: 1 };

function makeStore({ auditFails = false } = {}) {
  const state = { approval: { id: "p1", nonce: "n1", consumed: false, status: "approved", tenantId: "t1", actorId: "a1", action: "money.transfer", argumentDigest: agentArgumentDigest(args), expiresAt: Date.now() + 60_000 }, events: [] };
  return {
    state,
    async transaction(fn) {
      const original = structuredClone(state);
      const tx = {
        async getApproval(id) { return id === state.approval.id ? structuredClone(state.approval) : null; },
        async consumeApproval(id, nonce) {
          if (id !== state.approval.id || nonce !== state.approval.nonce || state.approval.consumed) return false;
          state.approval.consumed = true; return true;
        },
        async appendAudit(event) { if (auditFails) throw Error("audit unavailable"); state.events.push(event); }
      };
      try { return await fn(tx); } catch (error) { state.approval = original.approval; state.events = original.events; throw error; }
    }
  };
}
const call = store => authorizeAgentExecution({ store, action: "money.transfer", args, context, approvalId: "p1", policy });

test("consumes approval and records audit", async () => {
  const store = makeStore(); assert.equal((await call(store)).allowed, true);
  assert.equal(store.state.approval.consumed, true);
  assert.equal(store.state.events[0].allowed, true);
});
test("replay is denied and audited", async () => {
  const store = makeStore(); await call(store);
  assert.equal((await call(store)).reason, "approval_required");
  assert.equal(store.state.events.length, 2);
});
test("audit failure rolls back consumption and fails closed", async () => {
  const store = makeStore({ auditFails: true });
  assert.equal((await call(store)).allowed, false);
  assert.equal(store.state.approval.consumed, false);
});
test("missing transaction adapter fails closed", async () => {
  assert.equal((await call(null)).allowed, false);
});
test("kill switch denies without consuming approval", async () => {
  const store = makeStore();
  const result = await authorizeAgentExecution({ store, action: "money.transfer", args, context, approvalId: "p1", policy: { ...policy, killSwitch: true } });
  assert.equal(result.allowed, false);
  assert.equal(store.state.approval.consumed, false);
});

test("malformed arguments fail closed before database transaction", async () => {
  let touched = false;
  const store = { async transaction() { touched = true; throw Error("must not run"); } };
  const result = await authorizeAgentExecution({
    store, action: "money.transfer", args: { amount: NaN }, context,
    approvalId: "p1", policy
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "invalid_arguments");
  assert.equal(touched, false);
});

test("authorization rejects missing trusted identities before starting transaction", async () => {
  let transactions = 0;
  const store = { async transaction() { transactions++; throw Error("should not run"); } };
  for (const context of [null, {}, { tenantId: " ", actorId: "owner" }, { tenantId: "tenant", actorId: 42 }]) {
    const result = await authorizeAgentExecution({ store, action: "invoice.draft", args: {}, context, policy: { enabled: true, auditAvailable: true } });
    assert.deepEqual(result, { allowed: false, reason: "unauthorized_action" });
  }
  assert.equal(transactions, 0);
});

test("authorization core rejects malformed action and approval IDs without database work", async () => {
  let transactions = 0;
  const store = { async transaction() { transactions++; throw Error("should not run"); } };
  const context = { tenantId: "tenant-a", actorId: "owner-a" };
  const policy = { enabled: true, auditAvailable: true };
  for (const input of [{ action: 17 }, { action: " " }, { action: "invoice.draft", approvalId: {} }, { action: "invoice.draft", approvalId: " " }]) {
    const result = await authorizeAgentExecution({ store, context, args: {}, policy, ...input });
    assert.deepEqual(result, { allowed: false, reason: "invalid_request" });
  }
  assert.equal(transactions, 0);
});

test("draft queueing occurs within authorization transaction", async () => {
  const calls = [];
  const store = { async transaction(fn) {
    const tx = {
      async getApproval() { return null; },
      async consumeApproval() { throw Error("unexpected approval"); },
      async appendAudit(event) { calls.push(["audit", event]); },
      async enqueueIntent(event, key) { calls.push(["enqueue", event, key]); }
    };
    return fn(tx);
  } };
  const result = await authorizeAgentExecution({
    store, action: "invoice.draft", args: {}, context,
    policy: { enabled: true, auditAvailable: true, allowedActions: ["invoice.draft"], remainingBudget: 2, estimatedCost: 1 },
    queueIntent: true, idempotencyKey: "invoice-1"
  });
  assert.equal(result.allowed, true);
  assert.equal(result.queued, true);
  assert.deepEqual(calls.map(x => x[0]), ["audit", "enqueue"]);
  assert.equal(calls[1][1].id, calls[0][1].id);
});

test("queue failure fails authorization closed", async () => {
  const store = { async transaction(fn) {
    return fn({
      async getApproval() { return null; },
      async consumeApproval() { return true; },
      async appendAudit() {},
      async enqueueIntent() { throw Error("database unavailable"); }
    });
  } };
  const result = await authorizeAgentExecution({
    store, action: "invoice.draft", args: {}, context,
    policy: { enabled: true, auditAvailable: true, allowedActions: ["invoice.draft"], remainingBudget: 2, estimatedCost: 1 },
    queueIntent: true, idempotencyKey: "invoice-2"
  });
  assert.deepEqual(result, { allowed: false, reason: "governance_unavailable" });
});

test("sensitive actions cannot opt into queueing", async () => {
  let touched = false;
  const store = { async transaction() { touched = true; } };
  const result = await authorizeAgentExecution({ store, action: "money.transfer", args, context, policy, queueIntent: true, idempotencyKey: "sensitive-1" });
  assert.equal(result.allowed, false);
  assert.equal(touched, false);
});
