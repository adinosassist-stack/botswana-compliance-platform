import { authenticate, roleAllowed } from "./agentic-authority-core.js";
import { planWorkspaceAgentTasks } from "./workspace-agent-task-planning.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
});
const allowedWorkspaces = new Set(["owner", "finance", "property", "people", "compliance", "market", "operations"]);

// Candidate read-only endpoint. Router wiring is intentionally deferred until integration tests.
// No request-supplied tenant/user identity, source references, task status or approval is accepted.
export async function handleWorkspaceAgentTasksRequest({ request, logicalPath, env } = {}) {
  const path = String(logicalPath || new URL(request.url).pathname);
  if (path !== "/api/agentic/workspace-tasks") return null;
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const auth = await authenticate(request, env);
  if (!auth) return json({ error: "unauthenticated" }, 401);
  if (!roleAllowed(auth, "owner", "manager")) return json({ error: "forbidden" }, 403);
  const workspace = new URL(request.url).searchParams.get("workspace") || "owner";
  if (!allowedWorkspaces.has(workspace)) return json({ error: "invalid_workspace" }, 400);
  if (!env?.DB) return json({ error: "task_source_unavailable" }, 503);
  try {
    const result = await env.DB.prepare(`SELECT id,objective,workspace FROM agent_responsibilities
      WHERE tenant_id=? AND workspace=? AND status='active'
      ORDER BY updated_at DESC LIMIT 6`).bind(auth.tenant_id, workspace).all();
    const workUnits = (Array.isArray(result?.results) ? result.results : []).map(row => ({
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
