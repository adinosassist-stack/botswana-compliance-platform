import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmployeeWorkflowHandlers } from "../server/employee-workflow-handlers.js";

const workflow = { id: "w1", name: "Contract review", routineType: "contract_renewal", trigger: "daily", effect: "preview" };
const principal = { tenantId: "tenant-a", actorId: "employee-a", permissions: ["people.workflow.manage"] };

test("authenticated API saves workflow using verified principal, not client tenant", async () => {
  let captured;
  const handlers = createEmployeeWorkflowHandlers({
    resolvePrincipal: async () => principal,
    store: { async saveOwned(scope) { captured = scope; return true; } }
  });
  const result = await handlers.save({ body: { tenantId: "other", actorId: "attacker", workflow } });
  assert.equal(result.status, 200);
  assert.equal(captured.tenantId, "tenant-a");
  assert.equal(captured.ownerId, "employee-a");
});

test("unauthenticated requests fail before storage", async () => {
  let called = false;
  const handlers = createEmployeeWorkflowHandlers({
    resolvePrincipal: async () => null,
    store: { async listOwned() { called = true; return []; }, async saveOwned() { called = true; return true; } }
  });
  assert.equal((await handlers.list({})).status, 401);
  assert.equal((await handlers.save({ body: { workflow } })).status, 401);
  assert.equal(called, false);
});

test("permission failure returns 403", async () => {
  const handlers = createEmployeeWorkflowHandlers({ resolvePrincipal: async () => ({ ...principal, permissions: ["people.read"] }), store: {} });
  assert.equal((await handlers.list({})).status, 403);
});

test("malformed workflow returns 400", async () => {
  const handlers = createEmployeeWorkflowHandlers({ resolvePrincipal: async () => principal, store: { async saveOwned() { throw Error("should not run"); } } });
  assert.equal((await handlers.save({ body: { workflow: { ...workflow, effect: "payroll.run" } } })).status, 400);
});

test("principal resolver failures are unauthenticated", async () => {
  const handlers = createEmployeeWorkflowHandlers({ resolvePrincipal: async () => { throw Error("auth unavailable"); }, store: {} });
  assert.equal((await handlers.list({})).status, 401);
});

test("API lists only owner-scoped workflows", async () => {
  const handlers = createEmployeeWorkflowHandlers({ resolvePrincipal: async () => principal, store: {
    async listOwned() { return [
      { tenantId: "tenant-a", ownerId: "employee-a", workflow },
      { tenantId: "tenant-a", ownerId: "employee-b", workflow }
    ]; }
  } });
  const response = await handlers.list({});
  assert.equal(response.status, 200);
  assert.equal(response.body.workflows.length, 1);
});
