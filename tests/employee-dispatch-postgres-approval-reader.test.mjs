import test from "node:test";
import assert from "node:assert/strict";
import { createEmployeeDispatchPostgresApprovalReader } from "../server/employee-dispatch-postgres-approval-reader.js";
import { createEmployeeDispatchPostgresTransactionStore } from "../server/employee-dispatch-postgres-transaction.js";
import { queueEmployeeDispatch } from "../server/employee-dispatch-queue.js";

const proposalRow = {
  tenant_id: "tenant-a", proposal_id: "proposal-1",
  author_id: "author-1", action: "internal.task.create"
};
const reviewRow = {
  tenant_id: "tenant-a", proposal_id: "proposal-1",
  review_id: "review-1", reviewer_id: "reviewer-1", decision: "approved",
  review_sequence: "1", last_review_sequence: "1"
};

test("reader locks the tenant-scoped current head before returning a proposal", async () => {
  const calls = [];
  const reader = createEmployeeDispatchPostgresApprovalReader({
    async query(sql, params) { calls.push({ sql, params }); return { rows: [proposalRow] }; }
  });
  const result = await reader.getProposal("tenant-a", "proposal-1");
  assert.deepEqual(result, {
    id: "proposal-1", tenantId: "tenant-a",
    authorId: "author-1", action: "internal.task.create"
  });
  assert.match(calls[0].sql, /for update of h/i);
  assert.match(calls[0].sql, /h.tenant_id=\$1 and h.proposal_id=\$2/);
  assert.match(calls[0].sql, /h.revoked=false/);
  assert.deepEqual(calls[0].params, ["tenant-a", "proposal-1"]);
});

test("review methods fail closed until the proposal head was locked", async () => {
  let called = false;
  const reader = createEmployeeDispatchPostgresApprovalReader({
    async query() { called = true; return { rows: [] }; }
  });
  await assert.rejects(reader.getLatestReview("tenant-a", "proposal-1"), /proposal_lock_required/);
  await assert.rejects(reader.isCurrentApprovedReview("tenant-a", "proposal-1", "review-1"), /proposal_lock_required/);
  await assert.rejects(reader.isCurrentProposalRevision("tenant-a", "proposal-1", "review-1"), /proposal_lock_required/);
  assert.equal(called, false);
});

test("latest review is version-bound, tenant-bound and must be approved", async () => {
  const calls = [];
  let decision = "approved";
  const reader = createEmployeeDispatchPostgresApprovalReader({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/for update of h/i.test(sql)) return { rows: [proposalRow] };
      return { rows: [{ ...reviewRow, decision }] };
    }
  });
  await reader.getProposal("tenant-a", "proposal-1");
  assert.deepEqual(await reader.getLatestReview("tenant-a", "proposal-1"), {
    id: "review-1", tenantId: "tenant-a", proposalId: "proposal-1",
    reviewerId: "reviewer-1", status: "approved"
  });
  assert.equal(await reader.isCurrentApprovedReview("tenant-a", "proposal-1", "review-1"), true);
  assert.equal(await reader.isCurrentApprovedReview("tenant-a", "proposal-1", "review-old"), false);
  decision = "revoked";
  assert.equal(await reader.isCurrentApprovedReview("tenant-a", "proposal-1", "review-1"), false);
  assert.match(calls[1].sql, /h.current_revision=r.proposal_revision/);
  assert.match(calls[1].sql, /r.review_sequence, h.last_review_sequence/);
  assert.match(calls[1].sql, /order by r.review_sequence desc limit 1/);
  assert.deepEqual(calls[1].params, ["tenant-a", "proposal-1"]);
});

test("review reader refuses missing, superseded and malformed DB review sequences", async () => {
  let ordinal = "1";
  const calls = [];
  const reader = createEmployeeDispatchPostgresApprovalReader({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/for update of h/i.test(sql)) return { rows: [proposalRow] };
      return { rows: [{ ...reviewRow, review_sequence: ordinal, last_review_sequence: "2" }] };
    }
  });
  await reader.getProposal("tenant-a", "proposal-1");
  assert.equal(await reader.getLatestReview("tenant-a", "proposal-1"), null);
  assert.equal(await reader.isCurrentApprovedReview("tenant-a", "proposal-1", "review-1"), false);
  ordinal = "nonsense";
  assert.equal(await reader.isCurrentApprovedReview("tenant-a", "proposal-1", "review-1"), false);
  ordinal = "2";
  assert.equal(await reader.isCurrentApprovedReview("tenant-a", "proposal-1", "review-1"), true);
  assert.equal(calls.length, 5);
});

test("current revision check scopes the review to the locked proposal head", async () => {
  const calls = [];
  const reader = createEmployeeDispatchPostgresApprovalReader({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/for update of h/i.test(sql)) return { rows: [proposalRow] };
      return { rowCount: 1, rows: [{ "?column?": 1 }] };
    }
  });
  await reader.getProposal("tenant-a", "proposal-1");
  assert.equal(await reader.isCurrentProposalRevision("tenant-a", "proposal-1", "review-1"), true);
  assert.equal(await reader.isCurrentProposalRevision("tenant-a", "proposal-1", "review/invalid"), false);
  assert.match(calls[1].sql, /r.proposal_revision=h.current_revision/);
  assert.deepEqual(calls[1].params, ["tenant-a", "proposal-1", "review-1"]);
  assert.equal(calls.length, 2);
});

test("invalid or nonexistent proposal never acquires reader authority", async () => {
  const calls = [];
  const reader = createEmployeeDispatchPostgresApprovalReader({
    async query(sql, params) { calls.push([sql, params]); return { rows: [] }; }
  });
  await assert.rejects(reader.getProposal("tenant/other", "proposal-1"), /invalid_proposal_scope/);
  assert.equal(await reader.getProposal("tenant-a", "missing"), null);
  await assert.rejects(reader.getLatestReview("tenant-a", "missing"), /proposal_lock_required/);
  assert.equal(calls.length, 1);
  assert.throws(() => createEmployeeDispatchPostgresApprovalReader(null), /invalid_pg_client/);
});

test("reader cannot be mistaken for a complete dispatch store", async () => {
  const sql = [];
  const pool = {
    async connect() {
      return {
        async query(statement) { sql.push(statement); return { rows: [proposalRow] }; },
        release() { sql.push("RELEASE"); }
      };
    }
  };
  const store = createEmployeeDispatchPostgresTransactionStore(
    pool, client => createEmployeeDispatchPostgresApprovalReader(client)
  );
  const result = await queueEmployeeDispatch({
    store,
    identity: {
      tenantId: "tenant-a", actorId: "dispatcher-1",
      permissions: ["employee.workflow.dispatch"]
    },
    proposalId: "proposal-1", action: "internal.task.create",
    idempotencyKey: "once-1",
    featureEnabled: true, killSwitch: false, auditAvailable: true
  });
  assert.deepEqual(result, { queued: false, reason: "governance_unavailable" });
  assert.deepEqual(sql, ["BEGIN", "ROLLBACK", "RELEASE"]);
});
