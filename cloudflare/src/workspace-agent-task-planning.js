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
  const allowed = new Set((Array.isArray(allowedSourceRefs) ? allowedSourceRefs : []).map(x => clean(x, 120)).filter(Boolean));
  const seen = new Set();
  const tasks = [];
  for (const item of (Array.isArray(workUnits) ? workUnits : []).slice(0, 6)) {
    const id = clean(item?.id, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const refs = [...new Set((Array.isArray(item?.sourceRefs) ? item.sourceRefs : []).map(x => clean(x, 120)).filter(x => allowed.has(x)))];
    tasks.push(Object.freeze({
      id, workspace: scope, tenantId: tenant, userId: actor,
      title: clean(item?.objective, 500),
      priority: ["low", "medium", "high"].includes(item?.priority) ? item.priority : "medium",
      state: "queued", sourceRefs: Object.freeze(refs),
      sourceRefsDropped: Math.max(0, (Array.isArray(item?.sourceRefs) ? item.sourceRefs.length : 0) - refs.length),
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
  if (!task || !WORKSPACE_AGENT_TASK_STATES.includes(task.state) || !transitions[task.state].includes(next)) {
    return Object.freeze({ ok: false, code: "task_transition_invalid" });
  }
  // Completion is reserved for a trusted server-side approval/evidence workflow. 
  // A caller-supplied boolean is never evidence of reviewer authorization. 
  if (next === "completed") return Object.freeze({ ok: false, code: "trusted_completion_required" });
  return Object.freeze({ ok: true, code: "task_state_updated", task: Object.freeze({
    ...task, state: next, executionAllowed: false, externalSideEffects: false
  }) });
}
