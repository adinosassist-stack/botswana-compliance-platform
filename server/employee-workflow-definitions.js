import { EMPLOYEE_ROUTINE_TYPES, previewEmployeeRoutines } from "./employee-routines-preview.js";

/**
 * Employee-created workflow definitions. This is a safe compilation/preview
 * layer, NOT a scheduler, tool executor, or AI-generated-code interpreter.
 */
const TRIGGERS = new Set(["manual", "daily", "weekly"]);
const EFFECTS = new Set(["preview", "propose_internal_task"]);
const MAX_WORKFLOWS = 100;

export function validateEmployeeWorkflow(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) throw new TypeError("invalid_workflow");
  const { id, name, routineType, trigger, effect } = definition;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new TypeError("invalid_workflow_id");
  if (typeof name !== "string" || !name.trim() || name.length > 120) throw new TypeError("invalid_workflow_name");
  if (!EMPLOYEE_ROUTINE_TYPES.includes(routineType)) throw new TypeError("invalid_routine_type");
  if (!TRIGGERS.has(trigger)) throw new TypeError("invalid_trigger");
  if (!EFFECTS.has(effect)) throw new TypeError("invalid_effect");
  if (trigger === "weekly" && (!Number.isInteger(definition.weekday) || definition.weekday < 0 || definition.weekday > 6)) throw new TypeError("invalid_weekday");
  if (trigger !== "weekly" && definition.weekday !== undefined) throw new TypeError("unexpected_weekday");
  if (definition.enabled !== undefined && typeof definition.enabled !== "boolean") throw new TypeError("invalid_enabled");
  return Object.freeze({
    id, name: name.trim(), routineType, trigger, effect,
    ...(trigger === "weekly" ? { weekday: definition.weekday } : {}),
    enabled: definition.enabled !== false
  });
}

export function previewEmployeeWorkflows({ tenantId, today, employees, workflows, runManual = false } = {}) {
  if (!Array.isArray(workflows) || workflows.length > MAX_WORKFLOWS) throw new TypeError("invalid_workflows");
  const definitions = workflows.map(validateEmployeeWorkflow);
  if (new Set(definitions.map(w => w.id)).size !== definitions.length) throw new TypeError("duplicate_workflow_id");
  // Validate tenant/date/employees even when no workflow is due.
  const baseline = previewEmployeeRoutines({ tenantId, today, employees, enabledTypes: [] });
  const weekday = new Date(today + "T00:00:00.000Z").getUTCDay();
  const proposals = [];
  for (const workflow of definitions) {
    if (!workflow.enabled) continue;
    const due = workflow.trigger === "daily" || (workflow.trigger === "weekly" && workflow.weekday === weekday) ||
      (workflow.trigger === "manual" && runManual === true);
    if (!due) continue;
    const preview = previewEmployeeRoutines({ tenantId, today, employees, enabledTypes: [workflow.routineType] });
    for (const task of preview.tasks) {
      proposals.push({ workflowId: workflow.id, workflowName: workflow.name,
        // Stable, tenant-scoped identity for future deduplication; no task is created here.
        proposalKey: JSON.stringify([tenantId, workflow.id, task.employeeId, task.type, task.dueDate]),
        effect: workflow.effect, ...task, status: "proposed", requiresHumanReview: true });
    }
  }
  return { tenantId: baseline.tenantId, today: baseline.today, previewOnly: true, proposalCount: proposals.length, proposals };
}
