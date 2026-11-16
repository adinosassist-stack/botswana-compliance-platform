// Read-only presentation adapter for the existing Workspace Agent dock.
// The adapter accepts only server-supplied task snapshots; it never calls an action endpoint.
const STATES = Object.freeze({
  queued: "Queued",
  in_progress: "Working",
  needs_review: "Needs review",
  failed: "Failed"
});
const clean = (v, n = 240) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
export function workspaceAgentTaskView(snapshot, { tenantId, userId, workspace } = {}) {
  const tenant = clean(tenantId, 120), actor = clean(userId, 120), scope = clean(workspace, 32);
  if (!tenant || !actor || !scope || !snapshot?.ok || !Array.isArray(snapshot.tasks)) return Object.freeze([]);
  if (snapshot.tasks.length > 6) return Object.freeze([]);
  return Object.freeze(snapshot.tasks.filter(task =>
    task?.tenantId === tenant && task?.userId === actor && task?.workspace === scope &&
    Object.hasOwn(STATES, task?.state) &&
    typeof task?.id === "string" && !!clean(task.id, 120) &&
    typeof task?.title === "string" && !!clean(task.title, 240) &&
    task?.approvalRequired === true && task?.executionAllowed === false &&
    task?.externalSideEffects === false && task?.authority === "recommendation_only"
  ).map(task => Object.freeze({
    id: clean(task.id, 120),
    title: clean(task.title, 240),
    status: STATES[task.state],
    state: task.state,
    priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
    reviewRequired: task.approvalRequired === true,
    executionAvailable: false
  })));
}
