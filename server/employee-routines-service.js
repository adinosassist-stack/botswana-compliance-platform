import { previewEmployeeRoutines, EMPLOYEE_ROUTINE_TYPES } from "./employee-routines-preview.js";

/**
 * Backend integration boundary for the People workspace.
 * The caller must authenticate the request and provide a trusted principal,
 * authorized employee reader, and server-derived date.
 * No request-body identity, tenant, or employee rows are accepted.
 */
export async function previewAuthenticatedEmployeeRoutines({
  principal, readEmployees, today, enabledTypes = EMPLOYEE_ROUTINE_TYPES, windowDays = 30
} = {}) {
  if (typeof principal?.tenantId !== "string" || !principal.tenantId.trim() ||
      typeof principal?.actorId !== "string" || !principal.actorId.trim()) {
    return { ok: false, reason: "unauthenticated" };
  }
  if (!Array.isArray(principal.permissions) ||
      !principal.permissions.includes("people.read")) {
    return { ok: false, reason: "forbidden" };
  }
  if (typeof readEmployees !== "function") return { ok: false, reason: "data_unavailable" };
  try {
    const employees = await readEmployees({ tenantId: principal.tenantId, actorId: principal.actorId });
    const result = previewEmployeeRoutines({
      tenantId: principal.tenantId, today, employees, enabledTypes, windowDays
    });
    return { ok: true, ...result };
  } catch {
    return { ok: false, reason: "data_unavailable" };
  }
}
