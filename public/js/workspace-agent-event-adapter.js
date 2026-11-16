import { createWorkspaceAgentShellBridge } from "./workspace-agent-shell-bridge.js";

// Browser events are untrusted. They may invalidate state, but never activate
// the Agent or assert that a user, role, or tenant is authenticated.
export function createWorkspaceAgentEventAdapter({ target = globalThis.window, getDock, fetchImpl } = {}) {
  const bridge = createWorkspaceAgentShellBridge({ getDock, fetchImpl });
  let disposed = false;
  let active = false;
  let revision = 0;
  const onViewChange = () => { active = false; revision++; bridge.onWorkspaceChanged(); };
  const onShellHidden = () => { active = false; revision++; bridge.onSessionExpired(); };
  const onPageHide = () => { active = false; revision++; bridge.onDockUnmount(); };
  const onShellState = (event) => {
    const reason = event?.detail?.reason;
    if (reason === "logout" || reason === "shell-hidden") onShellHidden();
    else if (reason === "navigation") onViewChange();
  };
  target?.addEventListener?.("thebe:workspace-view-change", onViewChange);
  target?.addEventListener?.("thebe:workspace-agent-shell-state", onShellState);
  target?.addEventListener?.("pagehide", onPageHide);
  const activateFromTrustedShell = async ({ authenticated, workspace } = {}) => {
    if (disposed) return { ok: false, code: "adapter_disposed" };
    active = false;
    const current = ++revision;
    if (authenticated !== true) {
      bridge.onSessionExpired();
      return { ok: false, code: "authenticated_workspace_required" };
    }
    const result = await bridge.activate({ authenticated, workspace });
    if (disposed || current !== revision) return { ok: false, code: "identity_changed" };
    if (result?.ok === true) active = true;
    return result;
  };
  const clear = () => { active = false; revision++; bridge.onSessionExpired(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    target?.removeEventListener?.("thebe:workspace-view-change", onViewChange);
    target?.removeEventListener?.("thebe:workspace-agent-shell-state", onShellState);
    target?.removeEventListener?.("pagehide", onPageHide);
    bridge.dispose();
    active = false;
    revision++;
  };
  return Object.freeze({ activateFromTrustedShell, clear, dispose, isActive: () => active });
}
