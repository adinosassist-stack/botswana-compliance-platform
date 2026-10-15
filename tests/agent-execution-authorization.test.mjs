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
