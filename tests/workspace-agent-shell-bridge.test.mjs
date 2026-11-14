import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceAgentShellBridge } from "../public/js/workspace-agent-shell-bridge.js";
const dock = () => ({ id: "thebeAiDock", dataset: { surface: "workspace" }, querySelector: () => null });
test("unauthenticated shell never fetches or mounts", async () => {
  let count = 0;
  const bridge = createWorkspaceAgentShellBridge({ getDock: dock, fetchImpl: async () => { count++; } });
  assert.equal((await bridge.activate({ authenticated: false, workspace: "owner" })).code, "authenticated_workspace_required");
  assert.equal(count, 0);
  bridge.dispose();
});
test("refuses wrong dock", async () => {
  const bridge = createWorkspaceAgentShellBridge({ getDock: () => ({ id: "marketDock", dataset: { surface: "market" } }) });
  assert.equal((await bridge.activate({ authenticated: true, workspace: "owner" })).code, "workspace_dock_required");
  bridge.dispose();
});
test("tenant switch invalidates in-flight authenticated identity", async () => {
  let resolveRequest;
  const node = dock();
  const bridge = createWorkspaceAgentShellBridge({ getDock: () => node, fetchImpl: () => new Promise(resolve => { resolveRequest = resolve; }) });
  const pending = bridge.activate({ authenticated: true, workspace: "owner" });
  bridge.onTenantChanged();
  resolveRequest({ ok: true, json: async () => ({ ok: true, tenantId: "t", userId: "u" }) });
  assert.equal((await pending).code, "identity_changed");
  bridge.dispose();
});
test("workspace change and unmount dispose old controller", async () => {
  let count = 0;
  const bridge = createWorkspaceAgentShellBridge({ getDock: dock, fetchImpl: async () => { count++; return { ok: false }; } });
  bridge.onWorkspaceChanged();
  bridge.onDockUnmount();
  bridge.onSessionExpired();
  bridge.onLogout();
  bridge.dispose();
  assert.equal((await bridge.activate({ authenticated: true, workspace: "owner" })).code, "bridge_disposed");
  assert.equal(count, 0);
});
