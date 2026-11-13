import test from "node:test";
import assert from "node:assert/strict";
import { createAuthenticatedWorkspaceAgentController } from "../public/js/workspace-agent-authenticated-controller.js";

const dock = () => ({ id: "thebeAiDock", dataset: { surface: "workspace" }, querySelector: () => null });

test("invalid workspace never contacts identity endpoint", async () => {
  let calls = 0;
  const controller = createAuthenticatedWorkspaceAgentController({ dock: dock(), fetchImpl: async () => { calls++; } });
  assert.equal((await controller.refresh("other")).code, "authenticated_workspace_required");
  assert.equal(calls, 0);
});
test("unauthenticated identity response prevents task fetch", async () => {
  const urls = [];
  const controller = createAuthenticatedWorkspaceAgentController({ dock: dock(), fetchImpl: async url => {
    urls.push(url); return { ok: false, status: 401 };
  } });
  assert.equal((await controller.refresh("owner")).code, "identity_unavailable");
  assert.deepEqual(urls, ["/api/agentic/workspace-identity"]);
});
test("logout invalidates pending identity lookup", async () => {
  let resolve;
  const controller = createAuthenticatedWorkspaceAgentController({ dock: dock(), fetchImpl: () => new Promise(r => { resolve = r; }) });
  const pending = controller.refresh("owner");
  controller.clear();
  resolve({ ok: true, json: async () => ({ ok: true, tenantId: "a", userId: "b" }) });
  assert.equal((await pending).code, "identity_changed");
});
test("disposed controller cannot fetch identity", async () => {
  let calls = 0;
  const controller = createAuthenticatedWorkspaceAgentController({ dock: dock(), fetchImpl: async () => { calls++; } });
  controller.dispose();
  assert.equal((await controller.refresh("owner")).code, "controller_disposed");
  assert.equal(calls, 0);
});
