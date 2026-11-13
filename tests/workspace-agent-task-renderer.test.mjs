import test from "node:test";
import assert from "node:assert/strict";
import { renderWorkspaceAgentTasks } from "../public/js/workspace-agent-task-renderer.js";

test("renderer never touches DOM for invalid identity or snapshot", () => {
  let touched = 0;
  const dock = {
    id: "thebeAiDock",
    dataset: { surface: "workspace" },
    querySelector: () => { touched++; throw new Error("unexpected DOM access"); }
  };
  assert.equal(renderWorkspaceAgentTasks({ dock, snapshot: { ok: false, tasks: [] }, identity: { tenantId: "t", userId: "u", workspace: "finance" } }).ok, false);
  assert.equal(renderWorkspaceAgentTasks({ dock, snapshot: { ok: true, tasks: [] }, identity: { tenantId: "t", workspace: "finance" } }).ok, false);
  assert.equal(touched, 0);
});

test("renderer refuses mixed-tenant snapshot before touching DOM", () => {
  let touched = 0;
  const dock = {
    id: "thebeAiDock",
    dataset: { surface: "workspace" },
    querySelector: () => { touched++; throw new Error("unexpected DOM access"); }
  };
  const identity = { tenantId: "tenant-a", userId: "user-a", workspace: "finance" };
  const snapshot = { ok: true, tasks: [
    { id: "one", tenantId: "tenant-a", userId: "user-a", workspace: "finance", state: "queued" },
    { id: "two", tenantId: "tenant-b", userId: "user-a", workspace: "finance", state: "queued" }
  ] };
  assert.equal(renderWorkspaceAgentTasks({ dock, identity, snapshot }).code, "task_scope_mismatch");
  assert.equal(touched, 0);
});
