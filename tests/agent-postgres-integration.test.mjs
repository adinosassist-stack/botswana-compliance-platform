import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { createPostgresAgentApprovalStore } from "../server/agent-postgres-store.js";
import { enqueueAgentIntent } from "../server/agent-outbox.js";
import { authorizeAgentExecution } from "../server/agent-execution-authorization.js";
import { agentArgumentDigest } from "../server/agent-action-policy.js";

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

test("outbox enforces tenant idempotency and unique authorization", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const tenantId = "outbox-" + randomUUID();
  const authId = randomUUID();
  const otherTenant = "outbox-" + randomUUID();
  const base = [randomUUID(), tenantId, "owner", "invoice.draft", "b".repeat(64), authId, "idem-1"];
  const sql = `insert into agent_action_outbox
    (id, tenant_id, actor_id, action, argument_digest, authorization_id, idempotency_key)
    values ($1,$2,$3,$4,$5,$6,$7)`;
  try {
    await client.query(sql, base);
    await assert.rejects(client.query(sql, [randomUUID(), tenantId, "owner", "invoice.draft", "b".repeat(64), randomUUID(), "idem-1"]), e => e.code === "23505");
    await assert.rejects(client.query(sql, [randomUUID(), tenantId, "owner", "invoice.draft", "b".repeat(64), authId, "idem-2"]), e => e.code === "23505");
    await client.query(sql, [randomUUID(), otherTenant, "owner", "invoice.draft", "b".repeat(64), randomUUID(), "idem-1"]);
    await assert.rejects(client.query("update agent_action_outbox set status='invalid' where id=$1", [base[0]]), e => e.code === "23514");
  } finally {
    await client.query("delete from agent_action_outbox where tenant_id=$1 or tenant_id=$2", [tenantId, otherTenant]).catch(() => {});
    await client.end();
  }
});

test("outbox enqueue requires matching authorized audit record", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const tenantId = "audit-" + randomUUID(), actorId = "owner", action = "invoice.draft";
  const authorizationId = randomUUID(), argumentDigest = "c".repeat(64);
  const intent = { pool: client, tenantId, actorId, action, argumentDigest, authorizationId, idempotencyKey: "once" };
  try {
    assert.equal((await enqueueAgentIntent(intent)).queued, false);
    await client.query(`insert into agent_action_audit
      (id,tenant_id,actor_id,action,argument_digest,allowed,reason)
      values ($1,$2,$3,$4,$5,true,'authorized')`,
      [authorizationId,tenantId,actorId,action,argumentDigest]);
    assert.equal((await enqueueAgentIntent({ ...intent, tenantId: "wrong-tenant" })).queued, false);
    assert.equal((await enqueueAgentIntent({ ...intent, argumentDigest: "d".repeat(64) })).queued, false);
    assert.equal((await enqueueAgentIntent(intent)).queued, true);
    assert.equal((await enqueueAgentIntent(intent)).queued, false);
  } finally {
    await client.query("delete from agent_action_outbox where tenant_id=$1", [tenantId]);
    await client.query("delete from agent_action_audit where id=$1", [authorizationId]);
    await client.end();
  }
});

test("database itself rejects sensitive action outbox rows", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const id = randomUUID();
  try {
    await assert.rejects(client.query(`insert into agent_action_outbox
      (id,tenant_id,actor_id,action,argument_digest,authorization_id,idempotency_key)
      values ($1,$2,$3,'money.transfer',$4,$5,$6)`,
      [id,"tenant-"+randomUUID(),"owner","a".repeat(64),randomUUID(),"blocked-"+randomUUID()]),
      error => error.code === "23514");
  } finally {
    await client.end();
  }
});

test("outbox lease state and timestamp must agree", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const id = randomUUID();
  try {
    await client.query(`insert into agent_action_outbox
      (id,tenant_id,actor_id,action,argument_digest,authorization_id,idempotency_key)
      values ($1,$2,'owner','invoice.draft',$3,$4,$5)`,
      [id,"lease-"+randomUUID(),"a".repeat(64),randomUUID(),"lease-"+randomUUID()]);
    await assert.rejects(client.query("update agent_action_outbox set status='leased' where id=$1", [id]), e => e.code === "23514");
    await client.query("update agent_action_outbox set status='leased', leased_until=now()+interval '1 minute' where id=$1", [id]);
    await assert.rejects(client.query("update agent_action_outbox set status='succeeded' where id=$1", [id]), e => e.code === "23514");
  } finally {
    await client.query("delete from agent_action_outbox where id=$1", [id]);
    await client.end();
  }
});

test("atomic draft authorization commits audit and outbox together", async () => {
  const client = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const tenantId = "atomic-" + randomUUID(), actorId = "owner";
  const args = { invoice: "INV-123" }, action = "invoice.draft";
  const policy = { enabled: true, auditAvailable: true, killSwitch: false, allowedActions: [action], remainingBudget: 2, estimatedCost: 1 };
  const store = createPostgresAgentApprovalStore(client, tenantId);
  try {
    const result = await authorizeAgentExecution({
      store, action, args, context: { tenantId, actorId }, policy,
      queueIntent: true, idempotencyKey: "invoice-123"
    });
    assert.equal(result.allowed, true);
    assert.equal(result.queued, true);
    const audit = await client.query("select * from agent_action_audit where id=$1", [result.authorizationId]);
    const outbox = await client.query("select * from agent_action_outbox where authorization_id=$1", [result.authorizationId]);
    assert.equal(audit.rowCount, 1);
    assert.equal(outbox.rowCount, 1);
    assert.equal(outbox.rows[0].argument_digest, agentArgumentDigest(args));
    assert.equal(outbox.rows[0].tenant_id, tenantId);
    const replay = await authorizeAgentExecution({
      store, action, args, context: { tenantId, actorId }, policy,
      queueIntent: true, idempotencyKey: "invoice-123"
    });
    assert.equal(replay.allowed, false);
    const auditCount = await client.query("select count(*)::int as n from agent_action_audit where tenant_id=$1 and allowed=true", [tenantId]);
    assert.equal(auditCount.rows[0].n, 1);
  } finally {
    await client.query("delete from agent_action_outbox where tenant_id=$1", [tenantId]);
    await client.query("delete from agent_action_audit where tenant_id=$1", [tenantId]);
    await client.end();
  }
});

test("duplicate draft queue request does not consume optional approval", async () => {
  const client = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const tenantId = "rollback-" + randomUUID(), actorId = "owner", action = "invoice.draft";
  const args = { invoice: "INV-456" }, digest = agentArgumentDigest(args), approvalId = randomUUID();
  const policy = { enabled: true, auditAvailable: true, killSwitch: false, allowedActions: [action], remainingBudget: 2, estimatedCost: 1 };
  try {
    await client.query(`insert into agent_action_approvals
      (id,tenant_id,actor_id,action,argument_digest,nonce,status,expires_at)
      values ($1,$2,$3,$4,$5,$6,'approved',now()+interval '1 hour')`,
      [approvalId,tenantId,actorId,action,digest,"nonce-"+randomUUID()]);
    const store = createPostgresAgentApprovalStore(client, tenantId);
    const first = await authorizeAgentExecution({
      store, action, args, context: { tenantId, actorId }, policy,
      approvalId, queueIntent: true, idempotencyKey: "invoice-456"
    });
    assert.equal(first.allowed, true);
    const second = await authorizeAgentExecution({
      store, action, args, context: { tenantId, actorId }, policy,
      approvalId, queueIntent: true, idempotencyKey: "invoice-456"
    });
    assert.equal(second.allowed, false);
    const approval = await client.query("select consumed_at from agent_action_approvals where id=$1", [approvalId]);
    assert.equal(approval.rows[0].consumed_at, null);
  } finally {
    await client.query("delete from agent_action_outbox where tenant_id=$1", [tenantId]);
    await client.query("delete from agent_action_audit where tenant_id=$1", [tenantId]);
    await client.query("delete from agent_action_approvals where tenant_id=$1", [tenantId]);
    await client.end();
  }
});

test("draft outbox conflict rolls back audit and preserves optional approval", async () => {
  const client = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const tenantId = "conflict-" + randomUUID(), actorId = "owner", action = "invoice.draft";
  const args = { invoice: "INV-789" }, digest = agentArgumentDigest(args);
  const approvalId = randomUUID(), existingAuthId = randomUUID();
  const key = "duplicate-key";
  const policy = { enabled: true, auditAvailable: true, killSwitch: false, allowedActions: [action], remainingBudget: 2, estimatedCost: 1 };
  try {
    await client.query(`insert into agent_action_approvals
      (id,tenant_id,actor_id,action,argument_digest,nonce,status,expires_at)
      values ($1,$2,$3,$4,$5,$6,'approved',now()+interval '1 hour')`,
      [approvalId,tenantId,actorId,action,digest,"nonce-"+randomUUID()]);
    await client.query(`insert into agent_action_outbox
      (id,tenant_id,actor_id,action,argument_digest,authorization_id,idempotency_key)
      values ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(),tenantId,actorId,action,digest,existingAuthId,key]);
    const result = await authorizeAgentExecution({
      store: createPostgresAgentApprovalStore(client,tenantId),
      action,args,context:{tenantId,actorId},approvalId,policy,
      queueIntent:true,idempotencyKey:key
    });
    assert.deepEqual(result,{allowed:false,reason:"governance_unavailable"});
    const approval = await client.query("select consumed_at from agent_action_approvals where id=$1",[approvalId]);
    assert.equal(approval.rows[0].consumed_at,null);
    const audit = await client.query("select count(*)::int as n from agent_action_audit where tenant_id=$1 and allowed=true",[tenantId]);
    assert.equal(audit.rows[0].n,0);
  } finally {
    await client.query("delete from agent_action_outbox where tenant_id=$1",[tenantId]);
    await client.query("delete from agent_action_audit where tenant_id=$1",[tenantId]);
    await client.query("delete from agent_action_approvals where tenant_id=$1",[tenantId]);
    await client.end();
  }
});


test("sensitive authorization rolls back real approval consumption when audit insertion fails", async () => {
  const client = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const tenantId = "sensitive-" + randomUUID(), actorId = "owner", action = "money.transfer";
  const args = { amountMinor: 100, currency: "BWP" }, approvalId = randomUUID();
  const policy = { enabled: true, auditAvailable: true, killSwitch: false, allowedActions: [action], remainingBudget: 2, estimatedCost: 1 };
  // Test-only constraint in the disposable CI database faults the actual audit
  // INSERT after approval consumption, without mocking transaction semantics.
  const constraint = "audit_fault_" + randomUUID().replaceAll("-", "");
  try {
    await client.query(`insert into agent_action_approvals
      (id,tenant_id,actor_id,action,argument_digest,nonce,status,expires_at)
      values ($1,$2,$3,$4,$5,$6,'approved',now()+interval '1 hour')`,
      [approvalId,tenantId,actorId,action,agentArgumentDigest(args),"nonce-"+randomUUID()]);
    await client.query(`alter table agent_action_audit add constraint ${constraint} check (tenant_id <> '${tenantId}')`);
    const input = { store: createPostgresAgentApprovalStore(client,tenantId), action,args,context:{tenantId,actorId},approvalId,policy };
    assert.deepEqual(await authorizeAgentExecution(input),{allowed:false,reason:"governance_unavailable"});
    assert.equal((await client.query("select consumed_at from agent_action_approvals where id=$1",[approvalId])).rows[0].consumed_at,null);
    assert.equal((await client.query("select count(*)::int as n from agent_action_audit where tenant_id=$1",[tenantId])).rows[0].n,0);
    await client.query(`alter table agent_action_audit drop constraint ${constraint}`);
    assert.equal((await authorizeAgentExecution(input)).allowed,true,"audit recovery allows exactly one authorization");
    assert.notEqual((await client.query("select consumed_at from agent_action_approvals where id=$1",[approvalId])).rows[0].consumed_at,null);
    assert.equal((await authorizeAgentExecution(input)).allowed,false,"consumed approval cannot be replayed");
    assert.equal((await client.query("select count(*)::int as n from agent_action_audit where tenant_id=$1 and allowed=true",[tenantId])).rows[0].n,1);
    assert.equal((await client.query("select count(*)::int as n from agent_action_outbox where tenant_id=$1",[tenantId])).rows[0].n,0,"sensitive authorization never queues or executes a transfer");
  } finally {
    await client.query(`alter table agent_action_audit drop constraint if exists ${constraint}`);
    await client.query("delete from agent_action_audit where tenant_id=$1",[tenantId]);
    await client.query("delete from agent_action_approvals where tenant_id=$1",[tenantId]);
    await client.end();
  }
});
