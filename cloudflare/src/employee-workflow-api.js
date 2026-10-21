import { createEmployeeWorkflowD1Store } from "./employee-workflow-d1-store.js";
import { createEmployeeWorkflowHandlers } from "../../server/employee-workflow-handlers.js";

/**
 * Cloudflare Worker route adapter. Called only after the Worker's existing
 * session validation. a is the trusted session, not request JSON.
 */
export async function handleEmployeeWorkflowRequest({ req, env, session, readJson, roleAllowed }) {
  if (!session?.tenant_id || !session?.user_id) return new Response(JSON.stringify({error:"unauthenticated"}),{status:401,headers:{"content-type":"application/json"}});
  const rolePermitted = roleAllowed(session,"owner","manager");
  if (!rolePermitted) return new Response(JSON.stringify({ok:false,reason:"forbidden"}),{status:403,headers:{"content-type":"application/json","cache-control":"no-store"}});
  const principal = { tenantId: session.tenant_id, actorId: session.user_id,
    permissions: rolePermitted ? ["people.workflow.manage"] : [] };
  const method = req.method;
  if (method !== "GET" && method !== "POST") return new Response(JSON.stringify({error:"method_not_allowed"}),{status:405,headers:{"content-type":"application/json","cache-control":"no-store","allow":"GET, POST"}});
  let response;
  try {
    const handlers = createEmployeeWorkflowHandlers({
      store: createEmployeeWorkflowD1Store(env?.DB),
      resolvePrincipal: async () => principal
    });
    if (method === "GET") response = await handlers.list({});
    else if (method === "POST") {
    let body;
    try { body = await readJson(req); }
    catch { return new Response(JSON.stringify({error:"invalid_json"}),{status:400,headers:{"content-type":"application/json"}}); }
    response = await handlers.save({body});
    } else response = {status:405,body:{error:"method_not_allowed"}};
  } catch {
    return new Response(JSON.stringify({ok:false,reason:"storage_unavailable"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
  }
  return new Response(JSON.stringify(response.body),{status:response.status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}
