import test from "node:test";
import assert from "node:assert/strict";
import { createEmployeeDispatchPostgresTransactionStore } from "../server/employee-dispatch-postgres-transaction.js";

function fakePool({ failCommit = false, failRollback = false } = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === "COMMIT" && failCommit) throw Error("commit_failed");
      if (sql === "ROLLBACK" && failRollback) throw Error("rollback_failed");
    },
    release() { calls.push("RELEASE"); }
  };
  return { calls, connect: async () => client };
}

test("dispatch transaction commits before releasing client", async () => {
  const pool = fakePool();
  const store = createEmployeeDispatchPostgresTransactionStore(pool, async () => ({ ok: true }));
  assert.equal(await store.transaction(tx => tx.ok), true);
  assert.deepEqual(pool.calls, ["BEGIN", "COMMIT", "RELEASE"]);
});

test("dispatch transaction rolls back when callback fails", async () => {
  const pool = fakePool();
  const store = createEmployeeDispatchPostgresTransactionStore(pool, async () => ({}));
  await assert.rejects(store.transaction(() => { throw Error("audit_failure"); }), /audit_failure/);
  assert.deepEqual(pool.calls, ["BEGIN", "ROLLBACK", "RELEASE"]);
});

test("dispatch transaction rejects missing adapter and rolls back", async () => {
  const pool = fakePool();
  const store = createEmployeeDispatchPostgresTransactionStore(pool, async () => null);
  await assert.rejects(store.transaction(() => true), /invalid_dispatch_transaction_adapter/);
  assert.deepEqual(pool.calls, ["BEGIN", "ROLLBACK", "RELEASE"]);
});

test("commit failure attempts rollback and always releases", async () => {
  const pool = fakePool({ failCommit: true, failRollback: true });
  const store = createEmployeeDispatchPostgresTransactionStore(pool, async () => ({}));
  await assert.rejects(store.transaction(() => true), /commit_failed/);
  assert.deepEqual(pool.calls, ["BEGIN", "COMMIT", "ROLLBACK", "RELEASE"]);
});

test("invalid dependencies and callback fail closed", async () => {
  assert.throws(() => createEmployeeDispatchPostgresTransactionStore({}, () => ({})), /invalid_dispatch_store_dependencies/);
  const pool = fakePool();
  const store = createEmployeeDispatchPostgresTransactionStore(pool, async () => ({}));
  await assert.rejects(store.transaction(null), /invalid_transaction_callback/);
  assert.deepEqual(pool.calls, []);
});
