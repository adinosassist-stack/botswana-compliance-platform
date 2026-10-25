/**
 * Thebe Employee Routines: deterministic, read-only preview planner.
 * This module never sends messages, updates employee records, or runs payroll.
 * Callers must source employees and tenant identity from an authenticated backend.
 */
export const EMPLOYEE_ROUTINE_TYPES = Object.freeze([
  "onboarding_checklist", "probation_review", "contract_renewal",
  "leave_review", "payroll_preparation"
]);

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
function dayDelta(date, today) {
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}
function normalizeEmployee(employee) {
  if (!employee || typeof employee !== "object" || Array.isArray(employee)) return null;
  if (typeof employee.id !== "string" || !employee.id.trim()) return null;
  if (employee.active === false) return null;
  return employee;
}
function task(type, employeeId, dueDate, title, severity = "normal") {
  return { type, employeeId, dueDate, title, severity, status: "proposed", requiresHumanReview: true };
}

/**
 * @param {object} input - Authenticated server-provided tenantId, today, and employees.
 * @returns {object} Proposed tasks only; no mutations or external side effects.
 */
export function previewEmployeeRoutines({ tenantId, today, employees, enabledTypes = EMPLOYEE_ROUTINE_TYPES, windowDays = 30 } = {}) {
  if (typeof tenantId !== "string" || !tenantId.trim()) throw new TypeError("invalid_tenant");
  const todayDate = validDate(today);
  if (!todayDate) throw new TypeError("invalid_today");
  if (!Array.isArray(employees) || employees.length > 10000) throw new TypeError("invalid_employees");
  if (!Array.isArray(enabledTypes) || enabledTypes.some(type => !EMPLOYEE_ROUTINE_TYPES.includes(type))) throw new TypeError("invalid_routines");
  if (!Number.isInteger(windowDays) || windowDays < 0 || windowDays > 365) throw new TypeError("invalid_window");
  const enabled = new Set(enabledTypes);
  const tasks = [];
  for (const raw of employees) {
    const employee = normalizeEmployee(raw);
    if (!employee) continue;
    // Never trust a cross-tenant employee row even if accidentally supplied by the caller.
    if (employee.tenantId !== tenantId) continue;
    const start = validDate(employee.startDate);
    const probation = validDate(employee.probationEndDate);
    const contract = validDate(employee.contractEndDate);
    const leave = validDate(employee.leaveReviewDate);
    const payroll = validDate(employee.nextPayrollDate);
    const addIfDue = (type, date, title, severity) => {
      if (!enabled.has(type) || !date) return;
      const delta = dayDelta(date, todayDate);
      if (delta < 0 || delta > windowDays) return;
      tasks.push(task(type, employee.id, date.toISOString().slice(0, 10), title, severity));
    };
    addIfDue("onboarding_checklist", start, "Review employee onboarding checklist");
    addIfDue("probation_review", probation, "Prepare probation review", "high");
    addIfDue("contract_renewal", contract, "Review contract renewal", "high");
    addIfDue("leave_review", leave, "Review employee leave balance");
    addIfDue("payroll_preparation", payroll, "Prepare payroll checklist", "high");
  }
  tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.employeeId.localeCompare(b.employeeId) || a.type.localeCompare(b.type));
  return { tenantId, today, previewOnly: true, generatedCount: tasks.length, tasks };
}
