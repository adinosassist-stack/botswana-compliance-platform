import { createAuthenticatedWorkspaceAgentController } from "./workspace-agent-authenticated-controller.js";

// Explicit shell integration: only the authenticated shell may supply the workspace.
// This adapter does not auto-mount, infer identity, or grant execution authority.
const ALLOWED = new Set(["owner", "finance", "property", "people", "compliance", "market", "operations"]);
export function createWorkspaceAgentDockLifecycle({ dock, fetchImpl } = {}) {
  const controller = createAuthenticatedWorkspaceAgentController({ dock, fetchImpl });
  let disposed = false;
  let revision = 0;
  let activeWorkspace = null;
  const clear = () => {
    revision++;
    activeWorkspace = null;
    controller.clear();
  };
  const activate = async ({ workspace, authenticated } = {}) => {
    if (disposed) return { ok: false, code: "controller_disposed" };
    clear();
    if (authenticated !== true || !ALLOWED.has(workspace) ||
        dock?.id !== "thebeAiDock" || dock?.dataset?.surface !== "workspace") {
      return { ok: false, code: "authenticated_workspace_required" };
    }
    activeWorkspace = workspace;
    const current = revision;
    const result = await controller.refresh(workspace);
    if (disposed || current !== revision || activeWorkspace !== workspace) {
      return { ok: false, code: "identity_changed" };
    }
    return result;
  };
  const onLogout = () => clear();
  const onSessionExpired = () => clear();
  const onTenantChanged = () => clear();
  const onWorkspaceChanged = () => clear();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clear();
    controller.dispose();
  };
  return Object.freeze({ activate, onLogout, onSessionExpired, onTenantChanged, onWorkspaceChanged, clear, dispose });
}
