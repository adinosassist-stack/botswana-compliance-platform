import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateEmployeeWorker } from "../server/employee-dispatch-worker-policy.js";

const identity = { tenantId: "t1", actorId: "worker1", permissions: ["employee.workflow.dispatch"] };
const proposal = { id: "p1", tenantId: "t1", authorId: "employee-author", action: "internal.task.create" };
const review = { id: "r1", tenantId: "t1", proposalId: "p1", reviewerId: "manager1", status: "approved" };
const intent = { tenantId: "t1", proposalId: "p1", reviewId: "r1", action: "internal.task.create", idempotencyKey: "k1", intentType: "task", state: "leased", attempts: 1, maxAttempts: 3, leaseToken: "lease-1", leaseExpiresAt: 2000000060 };
const base = { featureEnabled: true, killSwitch: false, auditAvailable: true,
  identity, proposal, review, intent, action: "internal.task.create",
  currentReview: true, reviewerAuthorized: true, currentRevision: true,
  leaseToken: "lease-1", nowEpochSeconds: 2000000000 };

test("eligible internal leased task may pass worker preflight", () => {
  assert.equal(evaluateEmployeeWorker(base).allowed, true);
});
test("worker fails closed for stopped governance", () => {
  for (const overrides of [{killSwitch: true}, {featureEnabled: false}, {auditAvailable: false}]) {
    assert.equal(evaluateEmployeeWorker({...base, ...overrides}).allowed, false);
  }
});
test("worker cannot execute with ambiguous governance flags", () => {
  for (const flag of ["featureEnabled", "killSwitch", "auditAvailable"]) {
    for (const value of [undefined, null, 0, 1, "", "false", "true", {}, []]) {
      assert.equal(evaluateEmployeeWorker({ ...base, [flag]: value }).allowed, false,
        `${flag} accepted ${typeof value} ${JSON.stringify(value)}`);
    }
  }
});
test("worker refuses revoked review, reviewer or proposal revision", () => {
  for (const overrides of [{currentReview: false}, {reviewerAuthorized: false}, {currentRevision: false}]) {
    assert.equal(evaluateEmployeeWorker({...base, ...overrides}).allowed, false);
  }
});
test("worker refuses tenant spoofing and wrong intent lifecycle", () => {
  for (const overrides of [
    {intent: {...intent, tenantId: "t2"}},
    {intent: {...intent, state: "pending"}},
    {intent: {...intent, attempts: 0}},
    {intent: {...intent, attempts: 1.5}},
    {intent: {...intent, reviewId: "r2"}},
    {intent: {...intent, action: "payroll.run"}}
  ]) assert.equal(evaluateEmployeeWorker({...base, ...overrides}).allowed, false);
});


test("worker denies original author self-approval even when worker identity differs", () => {
  const result = evaluateEmployeeWorker({ ...base, review: { ...review, reviewerId: proposal.authorId } });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "approval_required");
});


test("worker fails closed when original proposal author is unknown", () => {
  const result = evaluateEmployeeWorker({ ...base, proposal: { ...proposal, authorId: undefined } });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "approval_required");
});

test("worker rejects expired leases including the exact expiry boundary", () => {
  for (const nowEpochSeconds of [intent.leaseExpiresAt, intent.leaseExpiresAt + 1]) {
    assert.equal(evaluateEmployeeWorker({ ...base, nowEpochSeconds }).allowed, false);
  }
  assert.equal(evaluateEmployeeWorker({ ...base, nowEpochSeconds: intent.leaseExpiresAt - 1 }).allowed, true);
});

test("worker requires a valid token matching the current stored lease", () => {
  for (const leaseToken of [undefined, null, "", "wrong-token", "bad token", 1, {}, "x".repeat(201)]) {
    assert.equal(evaluateEmployeeWorker({ ...base, leaseToken }).allowed, false);
  }
  assert.equal(evaluateEmployeeWorker({ ...base, leaseToken: "bad token", intent: { ...intent, leaseToken: "bad token" } }).allowed, false);
  assert.equal(evaluateEmployeeWorker({ ...base, intent: { ...intent, leaseToken: undefined } }).allowed, false);
});

test("worker requires integer database expiry and trusted evaluation time", () => {
  for (const value of [undefined, null, "2000000000", NaN, Infinity, -1, 1.5, true, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(evaluateEmployeeWorker({ ...base, nowEpochSeconds: value }).allowed, false);
    assert.equal(evaluateEmployeeWorker({ ...base, intent: { ...intent, leaseExpiresAt: value } }).allowed, false);
  }
});

test("worker enforces the persisted retry limit", () => {
  for (const maxAttempts of [undefined, null, 0, 11, 1.5, "3", true]) {
    assert.equal(evaluateEmployeeWorker({ ...base, intent: { ...intent, maxAttempts } }).allowed, false);
  }
  assert.equal(evaluateEmployeeWorker({ ...base, intent: { ...intent, attempts: 4 } }).allowed, false);
  assert.equal(evaluateEmployeeWorker({ ...base, intent: { ...intent, attempts: 3 } }).allowed, true);
});

test("reclaimed intent fences the old worker and permits only the new token", () => {
  const reclaimed = { ...intent, attempts: 2, leaseToken: "lease-2", leaseExpiresAt: intent.leaseExpiresAt + 60 };
  assert.equal(evaluateEmployeeWorker(base).allowed, true);
  assert.equal(evaluateEmployeeWorker({ ...base, intent: reclaimed }).allowed, false);
  assert.equal(evaluateEmployeeWorker({ ...base, intent: reclaimed, leaseToken: "lease-2" }).allowed, true);
});

test("worker rejects mismatched, missing or forged execution categories", () => {
  for (const intentType of [undefined, null, "report", "payroll", "TASK", ""]) {
    const result = evaluateEmployeeWorker({ ...base, intent: { ...intent, intentType } });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "intent_type_mismatch");
  }
});
