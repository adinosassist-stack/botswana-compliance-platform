import { createWorkspaceAgentTaskController } from "./workspace-agent-task-fetch.js";

// Explicit opt-in adapter. The caller supplies the active workspace from its
// authenticated shell; this module never trusts URL, storage, or task payloads.
export function createAuthenticatedWorkspaceAgentController({ dock, fetchImpl = globalThis.fetch } = {}) {
  const controller = createWorkspaceAgentTaskController({ dock, fetchImpl });
  let epoch = 0;
  let disposed = false;
  let identityAbort = null;
  const clear = () => { epoch++; identityAbort?.abort(); identityAbort = null; controller.clear(); };
  const dispose = () => { disposed = true; epoch++; controller.dispose(); };
  const refresh = async (workspace) => {
    if (disposed) return { ok: false, code: "controller_disposed" };
    clear();
    const current = epoch;
    if (!["owner", "finance", "property", "people", "compliance", "market", "operations"].includes(workspace) ||
        !dock || dock.id !== "thebeAiDock" || dock.dataset?.surface !== "workspace" ||
        typeof fetchImpl !== "function") return { ok: false, code: "authenticated_workspace_required" };
    let response, identity;
    const requestAbort = new AbortController();
    identityAbort = requestAbort;
    try {
      response = await fetchImpl("/api/agentic/workspace-identity", {
        method: "GET", credentials: "same-origin", cache: "no-store", signal: requestAbort.signal,
        headers: { accept: "application/json" }
      });
      if (current !== epoch) return { ok: false, code: "identity_changed" };
      if (!response.ok) return { ok: false, code: "identity_unavailable" };
      identity = await response.json();
    } catch { return { ok: false, code: current !== epoch ? "identity_changed" : "identity_unavailable" }; }
    if (current === epoch) identityAbort = null;
    if (current !== epoch) return { ok: false, code: "identity_changed" };
    if (identity?.ok !== true || typeof identity.tenantId !== "string" ||
        typeof identity.userId !== "string" || !identity.tenantId || !identity.userId) {
      return { ok: false, code: "invalid_identity_response" };
    }
    return controller.refresh({ tenantId: identity.tenantId, userId: identity.userId, workspace });
  };
  return Object.freeze({ refresh, clear, dispose });
}
