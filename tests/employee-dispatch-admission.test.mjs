import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateEmployeeDispatch } from "../server/employee-dispatch-admission.js";

const identity = { tenantId: "tenant-a", actorId: "actor-a", permissions: ["employee.workflow.dispatch"] };
const proposal = { id: "proposal-a", tenantId: "tenant-a", authorId: "author-c", action: "internal.task.create" };
const review = { id: "review-a", proposalId: "proposal-a", tenantId: "tenant-a", reviewerId: "manager-b", status: "approved" };
const request = { featureEnabled: true, killSwitch: false, auditAvailable: true, identity, proposal, review, action: "internal.task.create", idempotencyKey: "task-a" };
const decide = overrides => evaluateEmployeeDispatch({ ...request, ...overrides });

test("disabled feature, kill switch, and audit outage fail closed", () => {
  for (const overrides of [{ featureEnabled: false }, { killSwitch: true }, { auditAvailable: false }]) {
    assert.equal(decide(overrides).reason, "governance_unavailable");
  }
});
test("tenant mismatch and proposal action spoofing are rejected", () => {
  assert.equal(decide({ proposal: { ...proposal, tenantId: "tenant-b" } }).reason, "proposal_scope_mismatch");
  assert.equal(decide({ proposal: { ...proposal, action: "internal.report.draft" } }).reason, "proposal_scope_mismatch");
});
test("independent persisted approval and scope are mandatory", () => {
  for (const changed of [{ status: "pending" }, { reviewerId: identity.actorId }, { tenantId: "tenant-b" }, { proposalId: "other" }]) {
    assert.equal(decide({ review: { ...review, ...changed } }).reason, "approval_required");
  }
});
test("permission, action registry and idempotency format fail closed", () => {
  assert.equal(decide({ identity: { ...identity, permissions: [] } }).reason, "unauthorized_actor");
  assert.equal(decide({ action: "payroll.run" }).reason, "unsupported_action");
  assert.equal(decide({ idempotencyKey: " " }).reason, "invalid_idempotency_key");
});
test("valid request only qualifies for later transactional authorization", () => {
  assert.deepEqual(decide({}), { allowed: true, reason: "eligible_for_transactional_authorization", intentType: "task" });
  assert.equal(evaluateEmployeeDispatch().allowed, false);
});

test("report drafts are eligible but never executed by admission", () => {
  const result = decide({
    action: "internal.report.draft",
    proposal: { ...proposal, action: "internal.report.draft" }
  });
  assert.deepEqual(result, { allowed: true, reason: "eligible_for_transactional_authorization", intentType: "report" });
  assert.equal(Object.hasOwn(result, "queued"), false);
});
test("unknown action cannot be smuggled through proposal metadata", () => {
  const forged = { ...proposal, action: "internal.task.create", requestedAction: "record.delete" };
  assert.equal(decide({ proposal: forged, action: "record.delete" }).reason, "unsupported_action");
});
test("missing reviewer and malformed identity fail closed", () => {
  assert.equal(decide({ review: null }).reason, "approval_required");
  assert.equal(decide({ identity: { ...identity, tenantId: "" } }).reason, "unauthorized_actor");
});


test("original proposal author cannot approve through a different dispatch actor", () => {
  assert.equal(decide({ review: { ...review, reviewerId: proposal.authorId } }).reason, "approval_required");
  assert.equal(decide({ proposal: { ...proposal, authorId: review.reviewerId } }).reason, "approval_required");
  assert.equal(decide({ proposal: { ...proposal, authorId: undefined } }).reason, "approval_required");
  assert.equal(decide({}).allowed, true);
});
