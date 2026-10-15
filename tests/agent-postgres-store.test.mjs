import assert from "node:assert/strict";
import { test } from "node:test";
import { createPostgresAgentApprovalStore } from "../server/agent-postgres-store.js";

test("tenant isolation is included in approval read and consume queries", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("select id, tenant_id")) return { rows: [], rowCount: 0 };
      if (sql.includes("update agent_action_approvals")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {}
  };
  const store = createPostgresAgentApprovalStore({ async connect() { return client; } }, "tenant-a");
  await store.transaction(async tx => {
    assert.equal(await tx.getApproval("00000000-0000-4000-8000-000000000001"), null);
    assert.equal(await tx.consumeApproval("00000000-0000-4000-8000-000000000001", "nonce"), false);
  });
  const scoped = calls.filter(c => c.sql.includes("agent_action_approvals"));
  assert.equal(scoped.length, 2);
  for (const call of scoped) assert.equal(call.params[1], "tenant-a");
  assert.ok(calls.some(c => c.sql === "COMMIT"));
});

test("audit rejects cross-tenant event and rolls back", async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); return { rows: [], rowCount: 0 }; }, release() {} };
  const store = createPostgresAgentApprovalStore({ async connect() { return client; } }, "tenant-a");
  await assert.rejects(store.transaction(tx => tx.appendAudit({ tenantId: "tenant-b", actorId: "owner" })), /audit_scope_invalid/);
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(!calls.includes("COMMIT"));
});
