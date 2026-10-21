import { listEmployeeWorkflows, saveEmployeeWorkflow } from "./employee-workflow-ownership-service.js";

/**
 * Framework-neutral authenticated API handlers.
 * principal MUST be supplied by verified server middleware, never request JSON.
 * Wire these handlers only behind an existing authenticated People route.
 */
export function createEmployeeWorkflowHandlers({ store, resolvePrincipal } = {}) {
  if (!store || typeof resolvePrincipal !== "function") throw new TypeError("invalid_handler_dependencies");
  async function principalFor(context) {
    try { return await resolvePrincipal(context); }
    catch { return null; }
  }
  return {
    async list(context) {
      const principal = await principalFor(context);
      const result = await listEmployeeWorkflows({ principal, store });
      return { status: result.ok ? 200 : result.reason === "unauthenticated" ? 401 : result.reason === "forbidden" ? 403 : 503, body: result };
    },
    async save(context) {
      const principal = await principalFor(context);
      // No identity, tenant or permissions may be derived from request.body.
      const result = await saveEmployeeWorkflow({ principal, definition: context?.body?.workflow, store });
      return { status: result.ok ? 200 : result.reason === "unauthenticated" ? 401 : result.reason === "forbidden" ? 403 : result.reason === "invalid_workflow" ? 400 : 503, body: result };
    }
  };
}
