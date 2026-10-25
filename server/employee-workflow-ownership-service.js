import { validateEmployeeWorkflow } from "./employee-workflow-definitions.js";

/**
 * Ownership-aware workflow configuration service.
 * Storage is an injected tenant-scoped adapter. No scheduler or side effects.
 * A production adapter must enforce tenant and owner scoping atomically.
 */
function authorize(principal) {
  if (typeof principal?.tenantId !== "string" || !principal.tenantId.trim() ||
      typeof principal?.actorId !== "string" || !principal.actorId.trim()) return "unauthenticated";
  if (!Array.isArray(principal.permissions) || !principal.permissions.includes("people.workflow.manage")) return "forbidden";
  return null;
}
export async function saveEmployeeWorkflow({ principal, definition, store } = {}) {
  const denied = authorize(principal);
  if (denied) return { ok: false, reason: denied };
  if (typeof store?.saveOwned !== "function") return { ok: false, reason: "storage_unavailable" };
  let workflow;
  try { workflow = validateEmployeeWorkflow(definition); }
  catch { return { ok: false, reason: "invalid_workflow" }; }
  try {
    const saved = await store.saveOwned({ tenantId: principal.tenantId, ownerId: principal.actorId, workflow });
    if (saved !== true) return { ok: false, reason: "not_saved" };
    return { ok: true, workflow };
  } catch { return { ok: false, reason: "storage_unavailable" }; }
}
export async function listEmployeeWorkflows({ principal, store } = {}) {
  const denied = authorize(principal);
  if (denied) return { ok: false, reason: denied };
  if (typeof store?.listOwned !== "function") return { ok: false, reason: "storage_unavailable" };
  try {
    const rows = await store.listOwned({ tenantId: principal.tenantId, ownerId: principal.actorId });
    if (!Array.isArray(rows)) return { ok: false, reason: "storage_unavailable" };
    const workflows = rows.filter(row => row?.tenantId === principal.tenantId && row?.ownerId === principal.actorId)
      .map(row => { try { return validateEmployeeWorkflow(row.workflow); } catch { return null; } }).filter(Boolean);
    return { ok: true, workflows };
  } catch { return { ok: false, reason: "storage_unavailable" }; }
}
