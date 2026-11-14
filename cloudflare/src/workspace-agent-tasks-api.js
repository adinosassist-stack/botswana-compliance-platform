import { authenticate, roleAllowed } from "./agentic-authority-core.js";
import { planWorkspaceAgentTasks } from "./workspace-agent-task-planning.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
const allowedWorkspaces = new Set(["owner", "finance", "property", "people", "compliance", "market", "operations"]);

// Authenticated read-only endpoint. Live deployment remains subject to PR review and release gates.
// No request-supplied tenant/user identity, source references, task status or approval is accepted.
export async function handleWorkspaceAgentTasksRequest({ request, logicalPath, env } = {}) {
  const path = String(logicalPath || new URL(request.url).pathname);
  const isIdentity = path === "/api/agentic/workspace-identity";
  if (!isIdentity && path !== "/api/agentic/workspace-tasks") return null;
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const auth = await authenticate(request, env);
  if (!auth?.tenant_id || !auth?.user_id) return json({ error: "unauthenticated" }, 401);
  if (!roleAllowed(auth, "owner", "manager")) return json({ error: "forbidden" }, 403);
  if (isIdentity) return json({ ok: true, tenantId: auth.tenant_id, userId: auth.user_id });
  // Never silently select the first of duplicate or empty workspace values.
  // Absent workspace retains the documented default owner scope.
  const requestedWorkspaces = new URL(request.url).searchParams.getAll("workspace");
  const workspace = requestedWorkspaces.length === 0 ? "owner" :
    requestedWorkspaces.length === 1 ? requestedWorkspaces[0] : null;
  if (!allowedWorkspaces.has(workspace)) return json({ error: "invalid_workspace" }, 400);
  if (!env?.DB) return json({ error: "task_source_unavailable" }, 503);
  try {
    const result = await env.DB.prepare(`SELECT id,objective,workspace FROM agent_responsibilities
      WHERE tenant_id=? AND workspace=? AND status='active'
      ORDER BY updated_at DESC LIMIT 24`).bind(auth.tenant_id, workspace).all();
    // Read a bounded candidate window so blank or duplicate objectives cannot
    // hide valid tasks; the planner still returns at most six advisory tasks.
    // A malformed/error D1 result is not an empty verified workspace.
    // Do not display a false "no tasks" success if the source is unavailable.
    if (result?.success === false || !Array.isArray(result?.results) || result.results.length > 24) {
      return json({ error: "task_source_unavailable" }, 503);
    }
    const workUnits = result.results.map(row => ({
      id: row.id, objective: row.objective, priority: "medium", sourceRefs: []
    }));
    const snapshot = planWorkspaceAgentTasks({
      workspace, tenantId: auth.tenant_id, userId: auth.user_id, workUnits, allowedSourceRefs: []
    });
    return json(snapshot);
  } catch {
    return json({ error: "task_source_unavailable" }, 503);
  }
}
