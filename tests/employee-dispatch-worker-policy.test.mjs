import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateEmployeeWorker } from "../server/employee-dispatch-worker-policy.js";

const identity = { tenantId: "t1", actorId: "worker1", permissions: ["employee.workflow.dispatch"] };
const proposal = { id: "p1", tenantId: "t1", authorId: "employee-author", action: "internal.task.create" };
const review = { id: "r1", tenantId: "t1", proposalId: "p1", reviewerId: "manager1", status: "approved" };
const intent = { tenantId: "t1", proposalId: "p1", reviewId: "r1", action: "internal.task.create", idempotencyKey: "k1", state: "leased", attempts: 1 };
const base = { featureEnabled: true, killSwitch: false, auditAvailable: true,
  identity, proposal, review, intent, action: "internal.task.create",
  currentReview: true, reviewerAuthorized: true, currentRevision: true };

test("eligible internal leased task may pass worker preflight", () => {
  assert.equal(evaluateEmployeeWorker(base).allowed, true);
});
test("worker fails closed for stopped governance", () => {
  for (const overrides of [{killSwitch: true}, {featureEnabled: false}, {auditAvailable: false}]) {
    assert.equal(evaluateEmployeeWorker({...base, ...overrides}).allowed, false);
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
