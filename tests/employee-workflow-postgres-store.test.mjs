import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmployeeWorkflowPostgresStore } from "../server/employee-workflow-postgres-store.js";

const workflow = { id: "w1", name: "Contract review", routineType: "contract_renewal", trigger: "weekly", weekday: 1, effect: "preview", enabled: true };

test("workflow persistence uses bound parameters and owner-scoped key", async () => {
  const calls = [];
  const store = createEmployeeWorkflowPostgresStore({ async query(sql, params) {
    calls.push({ sql, params });
    return { rowCount: 1 };
  } });
  assert.equal(await store.saveOwned({ tenantId: "tenant-a", ownerId: "employee-a", workflow }), true);
  assert.match(calls[0].sql, /on conflict \(tenant_id,owner_id,workflow_id\)/);
  assert.deepEqual(calls[0].params.slice(0, 3), ["tenant-a", "employee-a", "w1"]);
  assert.deepEqual(JSON.parse(calls[0].params[3]), workflow);
});

test("workflow listing filters by both tenant and employee owner", async () => {
  const store = createEmployeeWorkflowPostgresStore({ async query(sql, params) {
    assert.match(sql, /where tenant_id=\$1 and owner_id=\$2/);
    assert.deepEqual(params, ["t1", "a1"]);
    return { rows: [{ tenant_id: "t1", owner_id: "a1", definition: workflow }] };
  } });
  const rows = await store.listOwned({ tenantId: "t1", ownerId: "a1" });
  assert.deepEqual(rows, [{ tenantId: "t1", ownerId: "a1", workflow }]);
});

test("invalid storage scopes are rejected before SQL", async () => {
  let called = false;
  const store = createEmployeeWorkflowPostgresStore({ async query() { called = true; } });
  await assert.rejects(store.saveOwned({ tenantId: "", ownerId: "a1", workflow }), /invalid_scope/);
  await assert.rejects(store.listOwned({ tenantId: "t1", ownerId: "" }), /invalid_scope/);
  assert.equal(called, false);
});

test("invalid database pool is rejected", () => {
  assert.throws(() => createEmployeeWorkflowPostgresStore(null), /invalid_pool/);
});
