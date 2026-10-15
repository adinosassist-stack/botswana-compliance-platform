import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeAuthenticatedAgentAction } from "../server/agent-authenticated-service.js";

const policy = { enabled: true, killSwitch: false, auditAvailable: true, allowedActions: ["invoice.draft"], remainingBudget: 2, estimatedCost: 1 };

test("unauthenticated principal fails closed without touching database", async () => {
  const result = await authorizeAuthenticatedAgentAction({ pool: {}, principal: null, action: "invoice.draft", args: {}, policy });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "unauthenticated_or_unconfigured");
});

test("authenticated draft is audited in tenant-scoped transaction", async () => {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      return { rowCount: 1, rows: [] };
    },
    release() {}
  };
  const pool = { async connect() { return client; } };
  const result = await authorizeAuthenticatedAgentAction({
    pool, principal: { tenantId: "tenant-a", actorId: "owner-a" },
    action: "invoice.draft", args: { note: "preview" }, policy
  });
  assert.equal(result.allowed, true);
  const audit = queries.find(q => q.sql.includes("insert into agent_action_audit"));
  assert.equal(audit.values[1], "tenant-a");
  assert.equal(audit.values[2], "owner-a");
  assert.ok(queries.some(q => q.sql === "COMMIT"));
});

test("database outage fails closed", async () => {
  const pool = { async connect() { throw Error("db unavailable"); } };
  const result = await authorizeAuthenticatedAgentAction({
    pool, principal: { tenantId: "tenant-a", actorId: "owner-a" },
    action: "invoice.draft", args: {}, policy
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "governance_unavailable");
});

test("whitespace-only identity and invalid pool fail closed", async () => {
  const whitespace = await authorizeAuthenticatedAgentAction({
    pool: { connect() {} }, principal: { tenantId: " ", actorId: "owner" },
    action: "invoice.draft", args: {}, policy
  });
  assert.equal(whitespace.allowed, false);
  const invalidPool = await authorizeAuthenticatedAgentAction({
    pool: {}, principal: { tenantId: "tenant-a", actorId: "owner" },
    action: "invoice.draft", args: {}, policy
  });
  assert.equal(invalidPool.reason, "governance_unavailable");
});

test("malformed action and approval IDs are rejected before database access", async () => {
  let touched = false;
  const pool = { async connect() { touched = true; throw Error("unexpected"); } };
  const base = { pool, principal: { tenantId: "tenant-a", actorId: "owner-a" }, args: {}, policy };
  for (const request of [{ action: "" }, { action: 123 }, { action: "invoice.draft", approvalId: {} }, { action: "invoice.draft", approvalId: "  " }]) {
    const result = await authorizeAuthenticatedAgentAction({ ...base, ...request });
    assert.deepEqual(result, { allowed: false, reason: "invalid_request" });
  }
  assert.equal(touched, false);
});
