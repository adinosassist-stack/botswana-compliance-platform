import { workspaceAgentTaskView } from "./workspace-agent-task-view.js";

// Explicit mount only: caller must provide an authenticated, server-authorized snapshot.
// Client filtering is presentation defense, NOT a substitute for server authorization.
export function renderWorkspaceAgentTasks({ dock, snapshot, identity } = {}) {
  if (!dock || dock.id !== "thebeAiDock" || dock.dataset?.surface !== "workspace") {
    return { ok: false, code: "workspace_dock_required" };
  }
  if (!identity?.tenantId || !identity?.userId || !identity?.workspace || !snapshot?.ok || !Array.isArray(snapshot.tasks)) {
    return { ok: false, code: "verified_task_context_required" };
  }
  if (snapshot.tasks.some(task => task?.tenantId !== identity.tenantId || task?.userId !== identity.userId || task?.workspace !== identity.workspace)) {
    return { ok: false, code: "task_scope_mismatch" };
  }
  if (snapshot.tasks.length > 6 || snapshot.tasks.some(task =>
    !task || !["queued", "in_progress", "needs_review", "failed"].includes(task.state) ||
    typeof task.id !== "string" || !task.id.trim() || typeof task.title !== "string" || !task.title.trim() ||
    task.approvalRequired !== true || task.executionAllowed !== false ||
    task.externalSideEffects !== false || task.authority !== "recommendation_only"
  )) {
    return { ok: false, code: "unsafe_task_snapshot" };
  }
  if (new Set(snapshot.tasks.map(task => task.id)).size !== snapshot.tasks.length) {
    return { ok: false, code: "duplicate_task_ids" };
  }
  let panel = dock.querySelector('[data-thebe-agent-task-panel="1"]');
  if (!panel) {
    panel = document.createElement("section");
    panel.dataset.thebeAgentTaskPanel = "1";
    panel.className = "thebe-agent-task-panel";
    panel.setAttribute("aria-label", "Workspace Agent tasks");
    panel.setAttribute("aria-live", "polite");
    const scrollArea = dock.querySelector(".thebe-ai-dock-scroll") ?? dock;
    scrollArea.append(panel);
  }
  panel.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = "Agent tasks";
  panel.append(heading);
  const tasks = workspaceAgentTaskView(snapshot, identity);
  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.textContent = "No verified tasks available for this workspace.";
    panel.append(empty);
    return { ok: true, count: 0 };
  }
  const list = document.createElement("ul");
  for (const task of tasks) {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = task.title || "Untitled task";
    const status = document.createElement("small");
    status.textContent = task.status + (task.reviewRequired ? " · Review required" : "");
    row.append(name, status);
    list.append(row);
  }
  panel.append(list);
  return { ok: true, count: tasks.length };
}
