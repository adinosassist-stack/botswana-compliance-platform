import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEmployeeDispatchAdmission as evaluate } from "../server/employee-dispatch-admission.js";

const valid = {
  featureEnabled: true, killSwitch: false, auditAvailable: true,
  tenantId: "tenant-a", actorId: "user-a", proposalTenantId: "tenant-a",
  action: "create_internal_task", persistedApprovalValid: true,
  reviewerAuthorized: true, currentProposalRevision: true,
  approvalUnrevoked: true, authorizationCurrent: true, budgetAvailable: true
};
test("valid preflight does not imply execution", () => {
  assert.deepEqual(evaluate(valid), { allowed: true, reason: "preflight_only" });
});
for (const [name, change] of [
  ["flag absent", { featureEnabled: undefined }],
  ["flag string", { featureEnabled: "true" }],
  ["kill switch", { killSwitch: true }],
  ["audit absent", { auditAvailable: undefined }],
  ["tenant replay", { proposalTenantId: "tenant-b" }],
  ["missing actor", { actorId: "" }],
  ["sensitive action", { action: "payroll" }],
  ["stale revision", { currentProposalRevision: false }],
  ["revoked approval", { approvalUnrevoked: false }],
  ["untrusted reviewer", { reviewerAuthorized: false }],
  ["missing authorization", { authorizationCurrent: false }],
  ["budget exhausted", { budgetAvailable: false }]
]) {
  test(name + " fails closed", () => assert.equal(evaluate({ ...valid, ...change }).allowed, false));
}
