/**
 * Safe browser-side workflow builder state. This module does not persist or
 * execute anything. A server must authenticate, authorize, validate and save.
 */
export const EMPLOYEE_WORKFLOW_TEMPLATES = Object.freeze([
  { id: "onboarding", label: "New employee onboarding", routineType: "onboarding_checklist" },
  { id: "probation", label: "Probation reviews", routineType: "probation_review" },
  { id: "contracts", label: "Contract renewals", routineType: "contract_renewal" },
  { id: "leave", label: "Leave reviews", routineType: "leave_review" },
  { id: "payroll", label: "Payroll preparation", routineType: "payroll_preparation" }
]);
const TRIGGERS = new Set(["manual", "daily", "weekly"]);
const EFFECTS = new Set(["preview", "propose_internal_task"]);
export function buildEmployeeWorkflowDraft({ id, name, templateId, trigger = "manual", weekday, effect = "preview" } = {}) {
  const template = EMPLOYEE_WORKFLOW_TEMPLATES.find(item => item.id === templateId);
  if (!template) throw new TypeError("invalid_template");
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new TypeError("invalid_id");
  if (typeof name !== "string" || !name.trim() || name.length > 120) throw new TypeError("invalid_name");
  if (!TRIGGERS.has(trigger)) throw new TypeError("invalid_trigger");
  if (!EFFECTS.has(effect)) throw new TypeError("invalid_effect");
  if (trigger === "weekly" && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) throw new TypeError("invalid_weekday");
  if (trigger !== "weekly" && weekday !== undefined) throw new TypeError("unexpected_weekday");
  return { id, name: name.trim(), routineType: template.routineType, trigger, effect,
    ...(trigger === "weekly" ? { weekday } : {}), enabled: true };
}
