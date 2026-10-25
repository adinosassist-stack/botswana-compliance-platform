import assert from "node:assert/strict";
import { test } from "node:test";
import { previewEmployeeWorkflows, validateEmployeeWorkflow } from "../server/employee-workflow-definitions.js";

const base = { tenantId: "t1", today: "2026-10-21", employees: [
  { id: "e1", tenantId: "t1", contractEndDate: "2026-11-01" },
  { id: "e2", tenantId: "t2", contractEndDate: "2026-11-01" }
] };
const workflow = { id: "renewals", name: "Renewal monitor", routineType: "contract_renewal", trigger: "daily", effect: "propose_internal_task" };

test("employee-defined workflow proposes reviewable tenant-scoped tasks", () => {
  const result = previewEmployeeWorkflows({ ...base, workflows: [workflow] });
  assert.equal(result.previewOnly, true);
  assert.equal(result.proposalCount, 1);
  assert.equal(result.proposals[0].employeeId, "e1");
  assert.equal(result.proposals[0].requiresHumanReview, true);
  assert.equal(result.proposals[0].status, "proposed");
});

test("manual workflows do not run automatically", () => {
  const manual = { ...workflow, trigger: "manual" };
  assert.equal(previewEmployeeWorkflows({ ...base, workflows: [manual] }).proposalCount, 0);
  assert.equal(previewEmployeeWorkflows({ ...base, workflows: [manual], runManual: true }).proposalCount, 1);
});

test("weekly workflow observes configured weekday", () => {
  assert.equal(previewEmployeeWorkflows({ ...base, workflows: [{ ...workflow, trigger: "weekly", weekday: 3 }] }).proposalCount, 1);
  assert.equal(previewEmployeeWorkflows({ ...base, workflows: [{ ...workflow, trigger: "weekly", weekday: 4 }] }).proposalCount, 0);
});

test("disabled workflows produce no tasks", () => {
  assert.equal(previewEmployeeWorkflows({ ...base, workflows: [{ ...workflow, enabled: false }] }).proposalCount, 0);
});

test("rejects arbitrary tool execution, payroll running, and messaging effects", () => {
  for (const effect of ["payroll.run", "message.send", "execute_code", "webhook"]) {
    assert.throws(() => validateEmployeeWorkflow({ ...workflow, effect }), /invalid_effect/);
  }
});

test("rejects duplicate IDs and malformed schedule", () => {
  assert.throws(() => previewEmployeeWorkflows({ ...base, workflows: [workflow, workflow] }), /duplicate_workflow_id/);
  assert.throws(() => validateEmployeeWorkflow({ ...workflow, trigger: "weekly", weekday: 7 }), /invalid_weekday/);
});

test("does not mutate workflow definitions or employee records", () => {
  const before = structuredClone({ ...base, workflows: [workflow] });
  previewEmployeeWorkflows({ ...base, workflows: [workflow] });
  assert.deepEqual({ ...base, workflows: [workflow] }, before);
});

test("proposal identities are stable, tenant-scoped and unique across workflow definitions", () => {
  const first = previewEmployeeWorkflows({ ...base, workflows: [workflow] });
  const second = previewEmployeeWorkflows({ ...base, workflows: [workflow] });
  assert.equal(first.proposals[0].proposalKey, second.proposals[0].proposalKey);
  const anotherWorkflow = { ...workflow, id: "renewals-2" };
  const multiple = previewEmployeeWorkflows({ ...base, workflows: [workflow, anotherWorkflow] });
  assert.equal(new Set(multiple.proposals.map(p => p.proposalKey)).size, 2);
  const otherTenant = previewEmployeeWorkflows({ tenantId: "t2", today: base.today, employees: [{ id: "e1", tenantId: "t2", contractEndDate: "2026-11-01" }], workflows: [workflow] });
  assert.notEqual(first.proposals[0].proposalKey, otherTenant.proposals[0].proposalKey);
  assert.equal(first.proposals[0].requiresHumanReview, true);
});
