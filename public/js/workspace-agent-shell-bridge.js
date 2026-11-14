import { createWorkspaceAgentDockLifecycle } from "./workspace-agent-dock-lifecycle.js";

// The authenticated shell must explicitly call activate with its own authorized
// workspace state. This bridge never infers roles or identity from the DOM/URL.
export function createWorkspaceAgentShellBridge({ getDock, fetchImpl } = {}) {
  let lifecycle = null;
  let currentDock = null;
  let epoch = 0;
  let disposed = false;
  const clear = () => {
    epoch++;
    lifecycle?.dispose();
    lifecycle = null;
    currentDock = null;
  };
  const activate = async ({ authenticated, workspace } = {}) => {
    if (disposed) return { ok: false, code: "bridge_disposed" };
    clear();
    if (authenticated !== true) return { ok: false, code: "authenticated_workspace_required" };
    const dock = typeof getDock === "function" ? getDock() : null;
    if (dock?.id !== "thebeAiDock" || dock?.dataset?.surface !== "workspace") {
      return { ok: false, code: "workspace_dock_required" };
    }
    currentDock = dock;
    lifecycle = createWorkspaceAgentDockLifecycle({ dock, fetchImpl });
    const generation = epoch;
    const result = await lifecycle.activate({ workspace, authenticated: true });
    if (disposed || epoch !== generation || currentDock !== dock) return { ok: false, code: "identity_changed" };
    return result;
  };
  const onLogout = clear;
  const onSessionExpired = clear;
  const onTenantChanged = clear;
  const onWorkspaceChanged = clear;
  const onDockUnmount = clear;
  const dispose = () => { if (disposed) return; disposed = true; clear(); };
  return Object.freeze({ activate, onLogout, onSessionExpired, onTenantChanged, onWorkspaceChanged, onDockUnmount, dispose });
}
