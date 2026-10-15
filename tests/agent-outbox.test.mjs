import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { enqueueAgentIntent } from "../server/agent-outbox.js";

const valid = {
  tenantId: "tenant-a", actorId: "owner-a", action: "invoice.draft",
  argumentDigest: "a".repeat(64), authorizationId: randomUUID(), idempotencyKey: "request-1"
};

test("invalid intent cannot reach storage", async () => {
  let queries = 0;
  const pool = { async query() { queries++; return { rows: [] }; } };
  for (const overrides of [{ tenantId: "" }, { actorId: 4 }, { argumentDigest: "bad" }, { authorizationId: "bad" }, { authorizationId: "------------------------------------" }, { idempotencyKey: "" }]) {
    assert.deepEqual(await enqueueAgentIntent({ ...valid, ...overrides, pool }), { queued: false, reason: "invalid_intent" });
  }
  assert.equal(queries, 0);
});

test("enqueue only reports success for inserted authorized row", async () => {
  const pool = { async query(sql, values) {
    assert.match(sql, /agent_action_audit/);
    assert.match(sql, /allowed=true/);
    assert.match(sql, /on conflict do nothing/);
    assert.equal(values[1], valid.tenantId);
    return { rows: [{ id: values[0] }] };
  } };
  assert.equal((await enqueueAgentIntent({ ...valid, pool })).queued, true);
  assert.deepEqual(await enqueueAgentIntent({ ...valid, pool: { async query() { return { rows: [] }; } } }), { queued: false, reason: "not_queued_or_duplicate" });
});

test("storage errors fail closed", async () => {
  assert.deepEqual(await enqueueAgentIntent({ ...valid, pool: { async query() { throw Error("db down"); } } }), { queued: false, reason: "storage_unavailable" });
});
