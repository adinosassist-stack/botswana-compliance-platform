import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateEmployeeDispatch } from "../server/employee-dispatch-admission.js";

const base = {
  featureEnabled: true, killSwitch: false, auditAvailable: true,
  identity: { tenantId: "tenant-a", actorId: "dispatcher-a", permissions: ["employee.workflow.dispatch"] },
  proposal: { id: "proposal-a", tenantId: "tenant-a", authorId: "author-a", action: "internal.task.create" },
  review: { id: "review-a", proposalId: "proposal-a", tenantId: "tenant-a", reviewerId: "reviewer-a", status: "approved" },
  action: "internal.task.create", idempotencyKey: "dispatch-a"
};
test("additional dispatch preflight regression: internal-only, no side effects", () => {
  const decision = evaluateEmployeeDispatch(base);
  assert.equal(decision.allowed, true);
  assert.equal(Object.hasOwn(decision, "executed"), false);
});
for (const [name, patch, reason] of [
  ["missing audit", { auditAvailable: undefined }, "governance_unavailable"],
  ["numeric enabled flag", { featureEnabled: 1 }, "governance_unavailable"],
  ["string kill switch", { killSwitch: "false" }, "governance_unavailable"],
  ["cross tenant proposal", { proposal: { ...base.proposal, tenantId: "tenant-b" } }, "proposal_scope_mismatch"],
  ["reviewer is proposal author", { review: { ...base.review, reviewerId: "author-a" } }, "approval_required"],
  ["reviewer is dispatcher", { review: { ...base.review, reviewerId: "dispatcher-a" } }, "approval_required"],
  ["missing author provenance", { proposal: { ...base.proposal, authorId: undefined } }, "approval_required"],
  ["cross tenant review", { review: { ...base.review, tenantId: "tenant-b" } }, "approval_required"],
  ["unapproved review", { review: { ...base.review, status: "revoked" } }, "approval_required"],
  ["sensitive action", { action: "payroll.run" }, "unsupported_action"],
  ["missing permission", { identity: { ...base.identity, permissions: [] } }, "unauthorized_actor"],
  ["malformed idempotency", { idempotencyKey: "bad key" }, "invalid_idempotency_key"]
]) {
  test("additional dispatch preflight regression: " + name, () => {
    assert.deepEqual(evaluateEmployeeDispatch({ ...base, ...patch }), { allowed: false, reason });
  });
}
