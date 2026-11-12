import test from "node:test";
import assert from "node:assert/strict";
import { workspaceAgentTaskView } from "../public/js/workspace-agent-task-view.js";
const task = (overrides = {}) => ({
  id: "a", title: "Review finance", state: "needs_review", priority: "high",
  tenantId: "tenant-a", userId: "user-a", workspace: "finance",
  approvalRequired: true, ...overrides
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
  assert.equal(view.length, 5);
});
