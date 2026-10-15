import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createPostgresAgentApprovalStore } from "../server/agent-postgres-store.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tenant = "tenant-" + randomUUID();
const id = randomUUID();
const nonce = "nonce-" + randomUUID();

test("real PostgreSQL enforces nonce uniqueness, tenant scope and single consumption", async () => {
  try {
    await pool.query(
      `insert into agent_action_approvals
       (id, tenant_id, actor_id, action, argument_digest, nonce, status, expires_at)
       values ($1,$2,$3,$4,$5,$6,'approved',now()+interval '1 hour')`,
      [id, tenant, "owner", "money.transfer", "a".repeat(64), nonce]
    );
    await assert.rejects(
      pool.query(
        `insert into agent_action_approvals
         (id, tenant_id, actor_id, action, argument_digest, nonce, status, expires_at)
         values ($1,$2,$3,$4,$5,$6,'approved',now()+interval '1 hour')`,
        [randomUUID(), tenant, "owner", "money.transfer", "a".repeat(64), nonce]
      ), error => error.code === "23505"
    );
    const wrongTenant = createPostgresAgentApprovalStore(pool, "another-tenant");
    assert.equal(await wrongTenant.transaction(tx => tx.getApproval(id)), null);
    const store = createPostgresAgentApprovalStore(pool, tenant);
    assert.equal(await store.transaction(tx => tx.consumeApproval(id, nonce)), true);
    assert.equal(await store.transaction(tx => tx.consumeApproval(id, nonce)), false);
    await assert.rejects(
      pool.query("update agent_action_approvals set status='rejected' where id=$1", [id]),
      error => error.code === "23514"
    );
  } finally {
    await pool.query("delete from agent_action_approvals where id=$1", [id]);
    await pool.end();
  }
});
