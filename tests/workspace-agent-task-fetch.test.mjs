import test from "node:test";
import assert from "node:assert/strict";
import { refreshWorkspaceAgentTaskPanel, clearWorkspaceAgentTaskPanel } from "../public/js/workspace-agent-task-fetch.js";
test("task fetch fails closed without authenticated workspace context", async () => {
  const result = await refreshWorkspaceAgentTaskPanel({ dock: { id: "thebeAiDock", dataset: { surface: "workspace" } } });
  assert.equal(result.ok, false);
  assert.equal(result.code, "authenticated_workspace_required");
});
test("task fetch rejects invalid workspace without a network call", async () => {
  let calls = 0;
  const result = await refreshWorkspaceAgentTaskPanel({
    dock: { id: "thebeAiDock", dataset: { surface: "workspace" } },
    identity: { tenantId: "t", userId: "u", workspace: "other" },
    fetchImpl: () => { calls++; throw new Error("must not fetch"); }
  });
  assert.equal(result.code, "invalid_workspace");
  assert.equal(calls, 0);
});
test("task fetch discards stale response after identity changes", async () => {
  const dock = { id: "thebeAiDock", dataset: { surface: "workspace", agentTaskScope: "other:u:finance" } };
  const result = await refreshWorkspaceAgentTaskPanel({
    dock, identity: { tenantId: "t", userId: "u", workspace: "finance" },
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, tasks: [] }) })
  });
  assert.equal(result.code, "identity_changed");
});
test("clear task panel drops scope even if panel is absent", () => {
  const dock = { dataset: { agentTaskScope: "t:u:finance" }, querySelector: () => null };
  clearWorkspaceAgentTaskPanel(dock);
  assert.equal(dock.dataset.agentTaskScope, undefined);
});

test("task fetch never starts when identity scope is stale", async () => {
  let calls = 0;
  const result = await refreshWorkspaceAgentTaskPanel({
    dock: { id: "thebeAiDock", dataset: { surface: "workspace", agentTaskScope: "old:u:finance" } },
    identity: { tenantId: "new", userId: "u", workspace: "finance" },
    fetchImpl: () => { calls++; throw new Error("unexpected request"); }
  });
  assert.equal(result.code, "identity_changed");
  assert.equal(calls, 0);
});
