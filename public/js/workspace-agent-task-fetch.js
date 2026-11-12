import { renderWorkspaceAgentTasks } from "./workspace-agent-task-renderer.js";

// The caller must supply identity from the authenticated workspace shell.
// This module never reads identity from URL parameters, localStorage or task snapshots.
export async function refreshWorkspaceAgentTaskPanel({
  dock, identity, fetchImpl = globalThis.fetch, signal
} = {}) {
  if (!dock || dock.id !== "thebeAiDock" || dock.dataset.surface !== "workspace" ||
      !identity?.tenantId || !identity?.userId || !identity?.workspace ||
      typeof fetchImpl !== "function") return { ok: false, code: "authenticated_workspace_required" };
  const workspace = String(identity.workspace);
  if (!["owner", "finance", "property", "people", "compliance", "market", "operations"].includes(workspace)) {
    return { ok: false, code: "invalid_workspace" };
  }
  const expectedScope = [identity.tenantId, identity.userId, workspace].join(":");
  if (dock.dataset.agentTaskScope !== expectedScope) return { ok: false, code: "identity_changed" };
  let response;
  try { response = await fetchImpl("/api/agentic/workspace-tasks?workspace=" + encodeURIComponent(workspace), {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
    headers: { accept: "application/json" }
  }); } catch { return { ok: false, code: signal?.aborted ? "request_aborted" : "task_fetch_unavailable" }; }
  if (signal?.aborted) return { ok: false, code: "request_aborted" };
  if (!response.ok) return { ok: false, code: "task_fetch_unavailable", status: response.status };
  let snapshot;
  try { snapshot = await response.json(); }
  catch { return { ok: false, code: "invalid_task_response" }; }
  if (signal?.aborted) return { ok: false, code: "request_aborted" };
  // An identity change while awaiting the response must invalidate the result.
  if (dock.dataset.agentTaskScope !== expectedScope) {
    return { ok: false, code: "identity_changed" };
  }
  if (!snapshot?.ok || !Array.isArray(snapshot.tasks)) return { ok: false, code: "invalid_task_snapshot" };
  return renderWorkspaceAgentTasks({ dock, snapshot, identity });
}

export function clearWorkspaceAgentTaskPanel(dock) {
  if (!dock) return;
  delete dock.dataset.agentTaskScope;
  dock.querySelector('[data-thebe-agent-task-panel="1"]')?.remove();
}
