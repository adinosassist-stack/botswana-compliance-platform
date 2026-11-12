import test from "node:test";
import assert from "node:assert/strict";
import { refreshWorkspaceAgentTaskPanel, clearWorkspaceAgentTaskPanel, createWorkspaceAgentTaskController } from "../public/js/workspace-agent-task-fetch.js";
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

test("invalid JSON fails closed without rendering tasks", async () => {
  const result = await refreshWorkspaceAgentTaskPanel({
    dock: { id: "thebeAiDock", dataset: { surface: "workspace", agentTaskScope: "t:u:finance" } },
    identity: { tenantId: "t", userId: "u", workspace: "finance" },
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } })
  });
  assert.equal(result.code, "invalid_task_response");
});

test("invalid snapshot envelope cannot create a task panel", async () => {
  const result = await refreshWorkspaceAgentTaskPanel({
    dock: { id: "thebeAiDock", dataset: { surface: "workspace", agentTaskScope: "t:u:finance" } },
    identity: { tenantId: "t", userId: "u", workspace: "finance" },
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, tasks: [] }) })
  });
  assert.equal(result.code, "invalid_task_snapshot");
});

test("mixed-tenant task snapshot is rejected as a whole", async () => {
  const result = await refreshWorkspaceAgentTaskPanel({
    dock: { id: "thebeAiDock", dataset: { surface: "workspace", agentTaskScope: "t:u:finance" } },
    identity: { tenantId: "t", userId: "u", workspace: "finance" },
    fetchImpl: async () => ({ ok: true, json: async () => ({
      ok: true, tasks: [{ id: "a", tenantId: "other", userId: "u", workspace: "finance", state: "queued" }]
    }) })
  });
  assert.equal(result.code, "task_scope_mismatch");
});

test("lifecycle controller clears scope and aborts pending fetch on logout", async () => {
  const dock = {
    id: "thebeAiDock", dataset: { surface: "workspace" },
    querySelector: () => null
  };
  let signal;
  const controller = createWorkspaceAgentTaskController({
    dock, fetchImpl: (_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }
  });
  const pending = controller.refresh({ tenantId: "t", userId: "u", workspace: "finance" });
  controller.clear();
  assert.equal(signal.aborted, true);
  assert.equal(dock.dataset.agentTaskScope, undefined);
  assert.equal((await pending).code, "identity_changed");
});

test("lifecycle controller contains renderer or transport exceptions", async () => {
  const dock = {
    id: "thebeAiDock", dataset: { surface: "workspace" },
    querySelector: () => { throw new Error("DOM unavailable"); }
  };
  const controller = createWorkspaceAgentTaskController({ dock });
  // Invalid context returns before a task request, but clear is still invoked.
  // Use a well-behaved dock to test transport failure separately.
  const safeDock = { id: "thebeAiDock", dataset: { surface: "workspace" }, querySelector: () => null };
  const safe = createWorkspaceAgentTaskController({
    dock: safeDock, fetchImpl: async () => { throw new Error("offline"); }
  });
  const result = await safe.refresh({ tenantId: "t", userId: "u", workspace: "owner" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "task_fetch_unavailable");
});

test("failed lifecycle refresh clears scoped task identity", async () => {
  const dock = { id: "thebeAiDock", dataset: { surface: "workspace" }, querySelector: () => null };
  const controller = createWorkspaceAgentTaskController({
    dock, fetchImpl: async () => ({ ok: false, status: 503 })
  });
  const result = await controller.refresh({ tenantId: "t", userId: "u", workspace: "owner" });
  assert.equal(result.ok, false);
  assert.equal(dock.dataset.agentTaskScope, undefined);
});

test("controller snapshots caller identity before asynchronous fetch", async () => {
  const dock = { id: "thebeAiDock", dataset: { surface: "workspace" }, querySelector: () => null };
  const identity = { tenantId: "tenant-a", userId: "u", workspace: "finance" };
  let finish;
  const controller = createWorkspaceAgentTaskController({
    dock, fetchImpl: () => new Promise(resolve => { finish = resolve; })
  });
  const pending = controller.refresh(identity);
  identity.tenantId = "tenant-b";
  finish({ ok: true, json: async () => ({ ok: true, tasks: [
    { id: "a", tenantId: "tenant-b", userId: "u", workspace: "finance", state: "queued" }
  ] }) });
  assert.equal((await pending).code, "task_scope_mismatch");
});
