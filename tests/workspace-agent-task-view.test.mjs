import test from "node:test";
import assert from "node:assert/strict";
import { workspaceAgentTaskView } from "../public/js/workspace-agent-task-view.js";
const task = (overrides = {}) => ({
  id: "a", title: "Review finance", state: "needs_review", priority: "high",
  tenantId: "tenant-a", userId: "user-a", workspace: "finance",
  approvalRequired: true, executionAllowed: false, externalSideEffects: false,
  authority: "recommendation_only", ...overrides
});
test("only displays tasks for matching tenant, user and workspace", () => {
  const view = workspaceAgentTaskView({ ok: true, tasks: [
    task(), task({ id: "b", tenantId: "tenant-b" }),
    task({ id: "c", userId: "other" }),
    task({ id: "d", workspace: "people" })
  ] }, { tenantId: "tenant-a", userId: "user-a", workspace: "finance" });
  assert.equal(view.length, 1);
  assert.equal(view[0].status, "Needs review");
  assert.equal(view[0].executionAvailable, false);
});
test("rejects unscoped, invalid and excessive task snapshots", () => {
  assert.deepEqual(workspaceAgentTaskView({ ok: true, tasks: [task()] }), []);
  const view = workspaceAgentTaskView({ ok: true, tasks: [
    task({ state: "not_a_state" }), ...Array.from({ length: 9 }, (_, i) => task({ id: String(i) }))
  ] }, { tenantId: "tenant-a", userId: "user-a", workspace: "finance" });
  assert.equal(view.length, 0);
});

test("rejects executable or unreviewed task payloads", () => {
  const identity = { tenantId: "tenant-a", userId: "user-a", workspace: "finance" };
  const snapshot = { ok: true, tasks: [
    task({ id: "execute", executionAllowed: true }),
    task({ id: "side-effects", externalSideEffects: true }),
    task({ id: "no-review", approvalRequired: false }),
    task({ id: "elevated", authority: "execute" }),
    task({ id: "advisory" })
  ] };
  assert.deepEqual(workspaceAgentTaskView(snapshot, identity).map(t => t.id), ["advisory"]);
});

test("presentation adapter rejects completed, malformed, and oversized snapshots", () => {
  const identity = { tenantId: "tenant-a", userId: "user-a", workspace: "finance" };
  const snapshot = { ok: true, tasks: [
    task({ id: "done", state: "completed" }),
    task({ id: "", title: "Missing identifier" }),
    task({ id: "bad-title", title: null }),
    task({ id: "blank-title", title: "  " }),
    task({ id: "blank-cleaned", title: "\\u0000" }),
    task({ id: "valid" })
  ] };
  assert.deepEqual(workspaceAgentTaskView(snapshot, identity).map(x => x.id), ["valid"]);
  assert.deepEqual(workspaceAgentTaskView({ ok: true, tasks: Array(7).fill(task()) }, identity), []);
});
