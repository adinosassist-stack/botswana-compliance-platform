import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceAgentDockLifecycle } from "../public/js/workspace-agent-dock-lifecycle.js";

const dock = () => ({ id: "thebeAiDock", dataset: { surface: "workspace" }, querySelector: () => null });
test("rejects unauthenticated activation without fetching", async () => {
  let requests = 0;
  const lifecycle = createWorkspaceAgentDockLifecycle({ dock: dock(), fetchImpl: async () => { requests++; throw Error("unexpected"); } });
  assert.equal((await lifecycle.activate({ workspace: "owner", authenticated: false })).code, "authenticated_workspace_required");
  assert.equal((await lifecycle.activate({ workspace: "invalid", authenticated: true })).code, "authenticated_workspace_required");
  assert.equal(requests, 0);
  lifecycle.dispose();
});
test("rejects non-workspace dock", async () => {
  const lifecycle = createWorkspaceAgentDockLifecycle({ dock: { id: "other", dataset: { surface: "market" } } });
  assert.equal((await lifecycle.activate({ workspace: "owner", authenticated: true })).code, "authenticated_workspace_required");
  lifecycle.dispose();
});
test("logout invalidates pending authenticated identity request", async () => {
  let resolveRequest;
  const lifecycle = createWorkspaceAgentDockLifecycle({
    dock: dock(),
    fetchImpl: () => new Promise(resolve => { resolveRequest = resolve; })
  });
  const pending = lifecycle.activate({ workspace: "owner", authenticated: true });
  lifecycle.onLogout();
  resolveRequest({ ok: true, json: async () => ({ ok: true, tenantId: "t", userId: "u" }) });
  assert.equal((await pending).code, "identity_changed");
  lifecycle.dispose();
});
test("dispose prevents subsequent activation", async () => {
  const lifecycle = createWorkspaceAgentDockLifecycle({ dock: dock() });
  lifecycle.dispose();
  assert.equal((await lifecycle.activate({ workspace: "owner", authenticated: true })).code, "controller_disposed");
});
