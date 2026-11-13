import test from "node:test";
import assert from "node:assert/strict";
import { planWorkspaceAgentTasks, transitionWorkspaceAgentTask } from "../cloudflare/src/workspace-agent-task-planning.js";

test("rejects missing tenant or user context", () => {
  assert.equal(planWorkspaceAgentTasks({ workspace: "finance", userId: "u" }).ok, false);
  assert.equal(planWorkspaceAgentTasks({ workspace: "unknown", tenantId: "t", userId: "u" }).ok, false);
});
test("bounds tasks, deduplicates IDs, and drops unauthorized sources", () => {
  const workUnits = Array.from({ length: 9 }, (_, i) => ({
    id: String(i), objective: "Review", sourceRefs: ["approved", "private"]
  }));
  const result = planWorkspaceAgentTasks({
    workspace: "finance", tenantId: "tenant-a", userId: "user-a",
    workUnits, allowedSourceRefs: ["approved"]
  });
  assert.equal(result.ok, true);
  assert.equal(result.tasks.length, 6);
  assert.deepEqual(result.tasks[0].sourceRefs, ["approved"]);
  assert.equal(result.tasks[0].sourceRefsDropped, 1);
  assert.equal(result.tasks[0].executionAllowed, false);
  assert.equal(result.tasks[0].approvalRequired, true);
  assert.equal(result.tasks[0].tenantId, "tenant-a");
});
test("completion requires review and cannot grant execution", () => {
  const task = planWorkspaceAgentTasks({
    workspace: "operations", tenantId: "t", userId: "u", workUnits: [{ id: "a", objective: "Review" }]
  }).tasks[0];
  const active = transitionWorkspaceAgentTask(task, "in_progress");
  assert.equal(active.ok, true);
  const pending = transitionWorkspaceAgentTask(active.task, "needs_review");
  assert.equal(transitionWorkspaceAgentTask(pending.task, "completed").ok, false);
  assert.equal(transitionWorkspaceAgentTask(pending.task, "completed", { reviewerApproved: true }).ok, false);
  assert.equal(transitionWorkspaceAgentTask(pending.task, "failed").ok, true);
});

test("duplicate IDs do not consume the six-task display capacity", () => {
  const workUnits = [
    { id: "a", objective: "First" }, { id: "a", objective: "Duplicate" },
    ...Array.from({ length: 7 }, (_, i) => ({ id: "item-" + i, objective: "Review" }))
  ];
  const result = planWorkspaceAgentTasks({ workspace: "owner", tenantId: "t", userId: "u", workUnits });
  assert.equal(result.tasks.length, 6);
  assert.equal(new Set(result.tasks.map(t => t.id)).size, 6);
});

test("state transitions reject forged or elevated task authority", () => {
  const task = planWorkspaceAgentTasks({
    workspace: "operations", tenantId: "t", userId: "u",
    workUnits: [{ id: "a", objective: "Review" }]
  }).tasks[0];
  for (const unsafe of [
    { executionAllowed: true },
    { externalSideEffects: true },
    { approvalRequired: false },
    { authority: "execute" },
    { tenantId: "" },
    { userId: "" },
    { id: "" },
    { workspace: "unknown" }
  ]) {
    assert.equal(transitionWorkspaceAgentTask({ ...task, ...unsafe }, "in_progress").code, "task_transition_invalid");
  }
  const transitioned = transitionWorkspaceAgentTask(task, "in_progress");
  assert.equal(transitioned.task.authority, "recommendation_only");
  assert.equal(transitioned.task.approvalRequired, true);
  assert.equal(transitioned.task.executionAllowed, false);
});
