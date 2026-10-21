import assert from "node:assert/strict";
import { test } from "node:test";
import { queueEmployeeDispatch } from "../server/employee-dispatch-queue.js";

const identity = { tenantId: "t1", actorId: "a1", permissions: ["employee.workflow.dispatch"] };
const proposal = { id: "p1", tenantId: "t1", action: "internal.task.create" };
const review = { id: "r1", proposalId: "p1", tenantId: "t1", reviewerId: "manager", status: "approved" };
const request = { identity, proposalId: "p1", action: "internal.task.create", idempotencyKey: "k1", featureEnabled: true, killSwitch: false, auditAvailable: true };

function store({ auditFails = false, savedProposal = proposal, savedReview = review } = {}) {
  const intents = new Map(), audit = [];
  return {
    intents, audit,
    async transaction(fn) {
      const staged = [], logs = [];
      const result = await fn({
        async lockDispatchKey() { return true; },
        async getProposal() { return savedProposal; },
        async getLatestReview() { return savedReview; },
        async isAuthorizedReviewer() { return true; },
        async insertIntentOnce(intent) {
          const key = intent.tenantId + ":" + intent.idempotencyKey;
          const previous = intents.get(key) ?? staged.find(x => x.key === key)?.intent;
          if (previous) return { status: "existing", sameIntent: JSON.stringify(previous) === JSON.stringify(intent) };
          staged.push({ key, intent }); return { status: "created" };
        },
        async appendAudit(event) { if (auditFails) throw Error("audit failure"); logs.push(event); }
      });
      for (const item of staged) intents.set(item.key, item.intent);
      audit.push(...logs);
      return result;
    }
  };
}

test("approved internal task produces one durable intent", async () => {
  const s = store();
  assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "intent_created");
  assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "already_queued");
  assert.equal(s.intents.size, 1);
});
test("audit outage rolls back the queued intent", async () => {
  const s = store({ auditFails: true });
  assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "governance_unavailable");
  assert.equal(s.intents.size, 0);
});
test("cross-tenant proposal and missing approval never queue", async () => {
  for (const s of [store({ savedProposal: { ...proposal, tenantId: "t2" } }), store({ savedReview: null })]) {
    assert.equal((await queueEmployeeDispatch({ ...request, store: s })).queued, false);
    assert.equal(s.intents.size, 0);
  }
});
test("kill switch and disabled feature block queue", async () => {
  const s = store();
  for (const override of [{ killSwitch: true }, { featureEnabled: false }]) {
    assert.equal((await queueEmployeeDispatch({ ...request, ...override, store: s })).reason, "governance_unavailable");
  }
  assert.equal(s.intents.size, 0);
});

test("missing transaction lock fails closed without creating an intent", async () => {
  const s = store();
  const original = s.transaction;
  s.transaction = async fn => original.call(s, async tx => {
    delete tx.lockDispatchKey;
    return fn(tx);
  });
  assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "governance_unavailable");
  assert.equal(s.intents.size, 0);
});
test("reused idempotency key with a different proposal is rejected", async () => {
  const s = store();
  assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "intent_created");
  const other = { ...proposal, id: "p2" };
  const otherReview = { ...review, id: "r2", proposalId: "p2" };
  const collision = {
    ...s,
    transaction: async fn => s.transaction(async tx => fn({
      ...tx,
      getProposal: async () => other,
      getLatestReview: async () => otherReview
    }))
  };
  assert.equal((await queueEmployeeDispatch({ ...request, proposalId: "p2", store: collision })).reason, "idempotency_conflict");
  assert.equal(s.intents.size, 1);
});

test("malformed tenant and idempotency are rejected before lock acquisition", async () => {
  for (const overrides of [
    { identity: { ...identity, tenantId: "" } },
    { idempotencyKey: "" },
    { idempotencyKey: "x".repeat(201) }
  ]) {
    const s = store();
    let lockCalls = 0;
    const original = s.transaction;
    s.transaction = fn => original.call(s, tx => fn({
      ...tx, lockDispatchKey: async () => { lockCalls++; }
    }));
    assert.equal((await queueEmployeeDispatch({ ...request, ...overrides, store: s })).queued, false);
    assert.equal(lockCalls, 0);
    assert.equal(s.intents.size, 0);
  }
});

test("failed or unconfirmed transactional lock prevents queue insertion", async () => {
  for (const lockResult of [false, undefined, null]) {
    const s = store();
    const original = s.transaction;
    s.transaction = fn => original.call(s, tx => fn({
      ...tx, lockDispatchKey: async () => lockResult
    }));
    assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "governance_unavailable");
    assert.equal(s.intents.size, 0);
    assert.equal(s.audit.length, 0);
  }
});

test("untrusted or unauthorized reviewer cannot authorize dispatch", async () => {
  const s = store();
  const original = s.transaction;
  s.transaction = fn => original.call(s, tx => fn({
    ...tx, isAuthorizedReviewer: async () => false
  }));
  assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "approval_required");
  assert.equal(s.intents.size, 0);
  assert.equal(s.audit.length, 0);
});
test("missing reviewer authorization capability fails closed", async () => {
  const s = store();
  const original = s.transaction;
  s.transaction = fn => original.call(s, tx => {
    delete tx.isAuthorizedReviewer;
    return fn(tx);
  });
  assert.equal((await queueEmployeeDispatch({ ...request, store: s })).reason, "governance_unavailable");
  assert.equal(s.intents.size, 0);
});
