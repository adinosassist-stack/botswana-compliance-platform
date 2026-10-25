import assert from "node:assert/strict";
import { test } from "node:test";
import { previewAuthenticatedEmployeeRoutines } from "../server/employee-routines-service.js";

const today = "2026-10-21";
const principal = { tenantId: "t1", actorId: "a1", permissions: ["people.read"] };
const employees = [
  { id: "e1", tenantId: "t1", startDate: "2026-10-22" },
  { id: "e2", tenantId: "t2", startDate: "2026-10-22" }
];

test("authenticated employee preview uses trusted tenant and filters foreign rows", async () => {
  let requested;
  const result = await previewAuthenticatedEmployeeRoutines({
    principal, today,
    readEmployees: async scope => { requested = scope; return employees; }
  });
  assert.deepEqual(requested, { tenantId: "t1", actorId: "a1" });
  assert.equal(result.ok, true);
  assert.equal(result.generatedCount, 1);
  assert.equal(result.tasks[0].employeeId, "e1");
});

test("unauthenticated principal cannot read employee data", async () => {
  let called = false;
  const result = await previewAuthenticatedEmployeeRoutines({
    principal: { tenantId: "t1" }, today,
    readEmployees: async () => { called = true; return employees; }
  });
  assert.deepEqual(result, { ok: false, reason: "unauthenticated" });
  assert.equal(called, false);
});

test("missing people.read permission denies before data access", async () => {
  let called = false;
  const result = await previewAuthenticatedEmployeeRoutines({
    principal: { ...principal, permissions: ["finance.read"] }, today,
    readEmployees: async () => { called = true; return employees; }
  });
  assert.deepEqual(result, { ok: false, reason: "forbidden" });
  assert.equal(called, false);
});

test("data reader failures fail closed without exposing employee records", async () => {
  const result = await previewAuthenticatedEmployeeRoutines({
    principal, today, readEmployees: async () => { throw Error("database offline"); }
  });
  assert.deepEqual(result, { ok: false, reason: "data_unavailable" });
});

test("missing employee reader fails closed", async () => {
  assert.deepEqual(await previewAuthenticatedEmployeeRoutines({ principal, today }),
    { ok: false, reason: "data_unavailable" });
});
