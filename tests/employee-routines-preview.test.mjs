import assert from "node:assert/strict";
import { test } from "node:test";
import { previewEmployeeRoutines, EMPLOYEE_ROUTINE_TYPES } from "../server/employee-routines-preview.js";

const today = "2026-10-21";
const employees = [
  { id: "e1", tenantId: "t1", active: true, startDate: "2026-10-22", probationEndDate: "2026-11-02", contractEndDate: "2026-11-04", leaveReviewDate: "2026-10-25", nextPayrollDate: "2026-10-31" },
  { id: "e2", tenantId: "t2", startDate: "2026-10-22", nextPayrollDate: "2026-10-31" },
  { id: "e3", tenantId: "t1", active: false, contractEndDate: "2026-10-23" }
];
const preview = (overrides = {}) => previewEmployeeRoutines({ tenantId: "t1", today, employees, ...overrides });

test("all five employee routine templates generate preview tasks", () => {
  const result = preview();
  assert.equal(result.previewOnly, true);
  assert.equal(result.generatedCount, 5);
  assert.deepEqual(new Set(result.tasks.map(t => t.type)), new Set(EMPLOYEE_ROUTINE_TYPES));
  assert.ok(result.tasks.every(t => t.status === "proposed" && t.requiresHumanReview));
});

test("cross-tenant and inactive employees are excluded", () => {
  const result = preview();
  assert.ok(result.tasks.every(t => t.employeeId === "e1"));
});

test("routine type filters and date windows are respected", () => {
  const result = preview({ enabledTypes: ["probation_review"], windowDays: 14 });
  assert.equal(result.generatedCount, 1);
  assert.equal(result.tasks[0].type, "probation_review");
});

test("overdue events are not silently scheduled for execution", () => {
  const result = preview({ employees: [{ id: "e1", tenantId: "t1", contractEndDate: "2026-10-20" }] });
  assert.equal(result.generatedCount, 0);
});

test("malformed dates and unsupported routine types fail safely", () => {
  assert.equal(preview({ employees: [{ id: "e1", tenantId: "t1", startDate: "2026-02-30" }] }).generatedCount, 0);
  assert.throws(() => preview({ enabledTypes: ["payroll.run"] }), /invalid_routines/);
  assert.throws(() => preview({ today: "2026-02-30" }), /invalid_today/);
});

test("planner does not mutate employee input", () => {
  const before = structuredClone(employees);
  preview();
  assert.deepEqual(employees, before);
});

test("invalid tenant and oversized employee batch are rejected", () => {
  assert.throws(() => preview({ tenantId: " " }), /invalid_tenant/);
  assert.throws(() => preview({ employees: Array(10001).fill({}) }), /invalid_employees/);
});
