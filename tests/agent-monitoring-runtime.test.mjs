import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeAgentExecution } from "../server/agent-execution-authorization.js";

const context = { tenantId: "tenant-a", actorId: "operator-a" };
const policy = { enabled: true, killSwitch: false, auditAvailable: true,
  allowedActions: ["invoice.draft", "operations.read", "monitoring.disable", "audit.delete"],
  remainingBudget: 10, estimatedCost: 1 };

function transactionStore({ failAudit = false } = {}) {
  const events = [];
  let transactions = 0;
  return {
    events,
    get transactions() { return transactions; },
    async transaction(fn) {
      transactions++;
      const staged = [];
      const tx = {
        async getApproval() { return null; },
        async consumeApproval() { throw Error("unexpected approval"); },
        async appendAudit(event) { if (failAudit) throw Error("audit unavailable"); staged.push(event); }
      };
      const result = await fn(tx);
      events.push(...staged);
      return result;
    }
  };
}

test("runtime authorization rejects monitoring mutations even when explicitly allowlisted", async () => {
  for (const action of ["monitoring.disable", "audit.delete"]) {
    const store = transactionStore();
    const result = await authorizeAgentExecution({ store, action, args: { enabled: false }, context, policy });
    assert.deepEqual(result, { allowed: false, reason: "unclassified_action" });
    assert.equal(store.events.length, 1);
    assert.equal(store.events[0].allowed, false);
  }
});

test("runtime audit write failure blocks draft authorization", async () => {
  const store = transactionStore({ failAudit: true });
  const result = await authorizeAgentExecution({ store, action: "invoice.draft", args: {}, context, policy });
  assert.deepEqual(result, { allowed: false, reason: "governance_unavailable" });
  assert.equal(store.events.length, 0);
});

test("runtime rejects actions without entering transaction if governance unavailable", async () => {
  for (const overrides of [{ auditAvailable: false }, { killSwitch: true }, { enabled: false }]) {
    const store = transactionStore();
    const result = await authorizeAgentExecution({
      store, action: "invoice.draft", args: {}, context, policy: { ...policy, ...overrides }
    });
    assert.deepEqual(result, { allowed: false, reason: "governance_unavailable" });
    assert.equal(store.transactions, 0);
  }
});

test("runtime records rejected monitoring mutation without queueing intent", async () => {
  const store = transactionStore();
  const result = await authorizeAgentExecution({
    store, action: "monitoring.disable", args: {}, context, policy, queueIntent: false
  });
  assert.equal(result.allowed, false);
  assert.equal(store.events[0].reason, "unclassified_action");
});
