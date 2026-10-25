import assert from "node:assert/strict";
import { test } from "node:test";
import { saveEmployeeWorkflow, listEmployeeWorkflows } from "../server/employee-workflow-ownership-service.js";

const principal = { tenantId: "t1", actorId: "a1", permissions: ["people.workflow.manage"] };
const workflow = { id: "w1", name: "Contracts", routineType: "contract_renewal", trigger: "daily", effect: "preview" };

test("save is scoped to authenticated tenant and employee owner", async () => {
  let captured;
  const result = await saveEmployeeWorkflow({ principal, definition: workflow, store: {
    async saveOwned(input) { captured = input; return true; }
  } });
  assert.equal(result.ok, true);
  assert.equal(captured.tenantId, "t1");
  assert.equal(captured.ownerId, "a1");
});

test("missing permission denies saving before storage access", async () => {
  let called = false;
  const result = await saveEmployeeWorkflow({
    principal: { ...principal, permissions: ["people.read"] }, definition: workflow,
    store: { async saveOwned() { called = true; return true; } }
  });
  assert.deepEqual(result, { ok: false, reason: "forbidden" });
  assert.equal(called, false);
});

test("invalid workflow cannot be saved", async () => {
  const result = await saveEmployeeWorkflow({ principal, definition: { ...workflow, effect: "payroll.run" }, store: { async saveOwned() { throw Error("should not run"); } } });
  assert.deepEqual(result, { ok: false, reason: "invalid_workflow" });
});

test("list excludes other tenant and other employee records", async () => {
  const result = await listEmployeeWorkflows({ principal, store: {
    async listOwned(scope) {
      assert.deepEqual(scope, { tenantId: "t1", ownerId: "a1" });
      return [
        { tenantId: "t1", ownerId: "a1", workflow },
        { tenantId: "t1", ownerId: "a2", workflow: { ...workflow, id: "other" } },
        { tenantId: "t2", ownerId: "a1", workflow: { ...workflow, id: "foreign" } }
      ];
    }
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.workflows.map(w => w.id), ["w1"]);
});

test("storage failure returns closed error without workflow disclosure", async () => {
  const result = await listEmployeeWorkflows({ principal, store: { async listOwned() { throw Error("offline"); } } });
  assert.deepEqual(result, { ok: false, reason: "storage_unavailable" });
});
