// Workspace Agent task planning is advisory only. No execution authority is granted.
export const WORKSPACE_AGENT_TASK_VERSION = "2026-11-12.v2";
export const WORKSPACE_AGENT_TASK_STATES = Object.freeze(["queued", "in_progress", "needs_review", "completed", "failed"]);
const WORKSPACES = new Set(["owner", "finance", "property", "people", "compliance", "market", "operations"]);
const clean = (value, max = 200) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export function planWorkspaceAgentTasks({ workspace, tenantId, userId, workUnits = [], allowedSourceRefs = [] } = {}) {
  const scope = clean(workspace, 32).toLowerCase();
  const tenant = clean(tenantId, 120);
  const actor = clean(userId, 120);
  if (!WORKSPACES.has(scope) || !tenant || !actor) {
    return Object.freeze({ ok: false, code: "workspace_context_required", tasks: Object.freeze([]) });
  }
  const allowed = new Set((Array.isArray(allowedSourceRefs) ? allowedSourceRefs.slice(0, 100) : []).map(x => clean(x, 120)).filter(Boolean));
  const seen = new Set();
  const tasks = [];
  for (const item of (Array.isArray(workUnits) ? workUnits : [])) {
    if (tasks.length >= 6) break;
    const id = clean(item?.id, 120);
    const title = clean(item?.objective, 500);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const sourceRefs = Array.isArray(item?.sourceRefs) ? item.sourceRefs : [];
    const refs = [...new Set(sourceRefs.slice(0, 100).map(x => clean(x, 120)).filter(x => allowed.has(x)))].slice(0, 20);
    tasks.push(Object.freeze({
      id, workspace: scope, tenantId: tenant, userId: actor,
      title,
      priority: ["low", "medium", "high"].includes(item?.priority) ? item.priority : "medium",
      state: "queued", sourceRefs: Object.freeze(refs),
      sourceRefsDropped: Math.max(0, sourceRefs.length - refs.length),
      approvalRequired: true, executionAllowed: false, externalSideEffects: false,
      authority: "recommendation_only"
    }));
  }
  return Object.freeze({ ok: true, code: "tasks_planned", tasks: Object.freeze(tasks) });
}

export function transitionWorkspaceAgentTask(task, nextState) {
  const next = clean(nextState, 32);
  const transitions = {
    queued: ["in_progress", "failed"],
    in_progress: ["needs_review", "failed"],
    needs_review: ["failed"],
    failed: ["queued"],
    completed: []
  };
  if (!task || !WORKSPACES.has(task.workspace) || !clean(task.tenantId, 120) || !clean(task.userId, 120) ||
      !clean(task.id, 120) || task.approvalRequired !== true ||
      task.executionAllowed !== false || task.externalSideEffects !== false ||
      task.authority !== "recommendation_only" ||
      !WORKSPACE_AGENT_TASK_STATES.includes(task.state) || !transitions[task.state].includes(next)) {
    return Object.freeze({ ok: false, code: "task_transition_invalid" });
  }
  // Completion is reserved for a trusted server-side approval/evidence workflow. 
  // A caller-supplied boolean is never evidence of reviewer authorization. 
  if (next === "completed") return Object.freeze({ ok: false, code: "trusted_completion_required" });
  return Object.freeze({ ok: true, code: "task_state_updated", task: Object.freeze({
    ...task, state: next, approvalRequired: true, authority: "recommendation_only",
    executionAllowed: false, externalSideEffects: false
  }) });
}
