import { createWorkspaceAgentEventAdapter } from "./workspace-agent-event-adapter.js";

// Advisory task selection only. No role, user or tenant identity comes from view IDs.
const VIEW_WORKSPACES = Object.freeze({
  dashboard:"owner", controlcenter:"owner",
  moneyhub:"finance", accounthub:"finance", billing:"finance",
  propertyintelligence:"property", sites:"property",
  peopleops:"people", employees:"people", employer:"people", dailyreports:"people",
  obligations:"compliance", evidencehub:"compliance", protecthub:"compliance",
  tenderhub:"market", publishing:"market", accountsocial:"market",
  workhub:"operations", businesshub:"operations", automationhub:"operations", workflowhub:"operations"
});
export function workspaceAgentScopeForView(view) {
  return Object.hasOwn(VIEW_WORKSPACES, view) ? VIEW_WORKSPACES[view] : null;
}

// Loaded only by an authenticated server-authorized, preview-enabled /app/ page.
// Browser lifecycle events never authenticate: each refresh rechecks /api/auth/me,
// and the existing Agent controller verifies the session-scoped opaque identity.
export function createWorkspaceAgentAppShell({
  target = globalThis.window, documentRef = globalThis.document,
  fetchImpl = globalThis.fetch, makeAdapter = createWorkspaceAgentEventAdapter,
  MutationObserverImpl = globalThis.MutationObserver
} = {}) {
  if (!target || !documentRef || typeof fetchImpl !== "function") return null;
  const adapter = makeAdapter({ target, getDock: () => documentRef.getElementById("thebeAiDock"), fetchImpl });
  let disposed = false, epoch = 0, requestAbort = null, awaitingDock = false;
  let dockObserver = null, gateObserver = null, viewObserver = null;
  let currentDock = documentRef.getElementById("thebeAiDock") || null;
  let lastDockSurface = currentDock?.dataset?.surface ?? null;
  let lastViewId = documentRef.querySelector(".view.active")?.id ?? null;
  const gateVisible = (id) => {
    const gate = documentRef.getElementById(id);
    return !!gate && !gate.hidden && !gate.classList?.contains("hidden");
  };
  const shellVisible = () => {
    const shell = documentRef.getElementById("appShell");
    return target.__THEBE_WORKSPACE_READY__ === true &&
      !!shell && !shell.hidden && !shell.classList?.contains("hidden") &&
      shell.style?.display !== "none" && shell.style?.visibility !== "hidden" &&
      !gateVisible("marketingGate") && !gateVisible("authGate");
  };
  const dockValid = () => {
    const dock = documentRef.getElementById("thebeAiDock");
    return dock?.id === "thebeAiDock" && dock?.dataset?.surface === "workspace";
  };
  const clear = () => {
    epoch++;
    requestAbort?.abort();
    requestAbort = null;
    awaitingDock = false;
    adapter.clear();
  };
  const refresh = async () => {
    if (disposed) return { ok: false, code: "app_shell_disposed" };
    clear();
    if (!shellVisible()) return { ok: false, code: "workspace_shell_hidden" };
    const view = documentRef.querySelector(".view.active")?.id;
    const workspace = workspaceAgentScopeForView(view);
    if (!workspace) return { ok: false, code: "unmapped_workspace_view" };
    if (!dockValid()) {
      awaitingDock = true;
      return { ok: false, code: "workspace_dock_required" };
    }
    const current = epoch, abort = new AbortController();
    requestAbort = abort;
    let response, payload;
    try {
      response = await fetchImpl("/api/auth/me", {
        method: "GET", credentials: "same-origin", cache: "no-store",
        headers: { accept: "application/json" }, signal: abort.signal
      });
      if (!response.ok) throw Error("session_unavailable");
      payload = await response.json();
    } catch {
      if (epoch === current) clear();
      return { ok: false, code: "session_unavailable" };
    }
    if (disposed || current !== epoch || !shellVisible() || !dockValid() ||
        workspaceAgentScopeForView(documentRef.querySelector(".view.active")?.id) !== workspace) {
      return { ok: false, code: "identity_changed" };
    }
    requestAbort = null;
    if (!["owner", "manager"].includes(payload?.user?.role) ||
        !payload?.user?.id || !payload?.csrfToken) {
      clear();
      return { ok: false, code: "unauthorized_workspace_role" };
    }
    const result = await adapter.activateFromTrustedShell({ authenticated: true, workspace });
    if (disposed || current !== epoch || !shellVisible()) return { ok: false, code: "identity_changed" };
    return result;
  };
  const onReady = () => { void refresh(); };
  const onViewChange = () => {
    // An event may accompany the real DOM class change: coalesce them.
    lastViewId = documentRef.querySelector(".view.active")?.id ?? null;
    void refresh();
  };
  const onViewMutation = () => {
    if (disposed) return;
    const nextViewId = documentRef.querySelector(".view.active")?.id ?? null;
    if (nextViewId === lastViewId) return;
    lastViewId = nextViewId;
    // Clear stale tenant/workspace advice immediately even if the canonical
    // runtime does not emit a custom view-change event.
    clear();
    if (shellVisible() && workspaceAgentScopeForView(nextViewId)) void refresh();
  };
  const onPageHide = () => clear();
  const onPageShow = () => { if (shellVisible()) void refresh(); };
  const onVisibilityChange = () => {
    // Returning to an old tab must revalidate the current server session.
    if (documentRef.visibilityState === "hidden") clear();
    else if (shellVisible()) void refresh();
    else clear();
  };
  // A company selector can change without a navigation event. Immediately
  // discard any advisory snapshot and independently reverify the session.
  const onCompanyChange = event => {
    if (event?.target?.id !== "companySelect") return;
    clear();
    if (shellVisible()) void refresh();
  };
  const onGateMutation = () => {
    if (!shellVisible()) clear();
    else if (!adapter.isActive()) void refresh();
  };
  const observeDock = () => {
    if (!dockObserver) return;
    dockObserver.disconnect();
    // The dock may be nested, replaced, or inserted after shell boot.
    if (documentRef.body) dockObserver.observe(documentRef.body, { childList: true, subtree: true });
    if (currentDock) dockObserver.observe(currentDock, {
      attributes: true, attributeFilter: ["data-surface"]
    });
  };
  const onBodyMutation = () => {
    if (disposed) return;
    const nextDock = documentRef.getElementById("thebeAiDock") || null;
    if (nextDock !== currentDock) {
      // An unmounted or replaced dock must never retain the previous scope.
      currentDock = nextDock;
      lastDockSurface = nextDock?.dataset?.surface ?? null;
      observeDock();
      clear();
      if (dockValid() && shellVisible()) void refresh();
      return;
    }
    const nextSurface = currentDock?.dataset?.surface ?? null;
    if (nextSurface !== lastDockSurface) {
      // Hiding the dock must clear its task state, not just block new fetches.
      lastDockSurface = nextSurface;
      clear();
      if (dockValid() && shellVisible()) void refresh();
      return;
    }
    if (awaitingDock && dockValid() && shellVisible()) void refresh();
  };
  target.addEventListener("thebe:workspace-ready", onReady);
  target.addEventListener("thebe:workspace-view-change", onViewChange);
  target.addEventListener("pagehide", onPageHide);
  target.addEventListener("pageshow", onPageShow);
  documentRef.addEventListener?.("visibilitychange", onVisibilityChange);
  documentRef.addEventListener?.("change", onCompanyChange, true);
  if (typeof MutationObserverImpl === "function") {
    gateObserver = new MutationObserverImpl(onGateMutation);
    for (const id of ["marketingGate", "authGate", "appShell"]) {
      const node = documentRef.getElementById(id);
      if (node) gateObserver.observe(node, { attributes: true, attributeFilter: ["class", "hidden", "style"] });
    }
    if (documentRef.body) {
      dockObserver = new MutationObserverImpl(onBodyMutation);
      observeDock();
    }
    const appShell = documentRef.getElementById("appShell");
    if (appShell) {
      viewObserver = new MutationObserverImpl(onViewMutation);
      viewObserver.observe(appShell, { attributes: true, subtree: true, attributeFilter: ["class"] });
    }
  }
  // The native ready event is already subscribed; registering a second runtime
  // callback would cause duplicate identity requests and cancel the first.
  if (target.__THEBE_WORKSPACE_READY__ === true) queueMicrotask(onReady);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clear();
    target.removeEventListener("thebe:workspace-ready", onReady);
    target.removeEventListener("thebe:workspace-view-change", onViewChange);
    target.removeEventListener("pagehide", onPageHide);
    target.removeEventListener("pageshow", onPageShow);
    documentRef.removeEventListener?.("visibilitychange", onVisibilityChange);
    documentRef.removeEventListener?.("change", onCompanyChange, true);
    dockObserver?.disconnect();
    gateObserver?.disconnect();
    viewObserver?.disconnect();
    adapter.dispose();
  };
  return Object.freeze({ refresh, clear, dispose, isActive: adapter.isActive });
}
if (typeof window !== "undefined" && typeof document !== "undefined" &&
    !window.__THEBE_AGENT_APP_SHELL__) {
  window.__THEBE_AGENT_APP_SHELL__ = createWorkspaceAgentAppShell();
}
