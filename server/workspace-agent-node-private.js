import { planWorkspaceAgentTasks } from "../cloudflare/src/workspace-agent-task-planning.js";

const PATHS = Object.freeze({
  identity: "/api/agentic/workspace-identity",
  tasks: "/api/agentic/workspace-tasks"
});
const WORKSPACES = new Set(["owner","finance","property","people","compliance","market","operations"]);
const reply=(res,status,payload)=>res.status(status)
  .set("Cache-Control","no-store")
  .set("X-Content-Type-Options","nosniff")
  .json(payload);

// Private Node transport parity candidate. Registration is explicitly disabled
// for every production or development environment. The protected tester must
// supply the real Node session authentication middleware (never DOM/URL IDs).
export function registerPrivateNodeWorkspaceAgent({
  app, sessionAuth, pool, appEnv, enabled
}={}) {
  if (appEnv !== "test" || enabled !== true) return false;
  if (typeof app?.all !== "function" || typeof sessionAuth !== "function" ||
      typeof pool?.query !== "function") throw Error("private_agent_test_dependencies_required");

  const handler=(endpoint)=>async(req,res)=>{
    if (req.method !== "GET") return reply(res,405,{error:"method_not_allowed"});
    const session=req.auth;
    const tenantId=session?.tenant_id;
    const userId=session?.user_id;
    if (typeof tenantId !== "string" || !tenantId || typeof userId !== "string" || !userId) {
      return reply(res,401,{error:"unauthenticated"});
    }
    if (!["owner","manager"].includes(session.role)) return reply(res,403,{error:"forbidden"});
    if (endpoint === "identity") return reply(res,200,{ok:true,tenantId,userId});
    const workspace=req.query?.workspace || "owner";
    if (typeof workspace !== "string" || !WORKSPACES.has(workspace)) {
      return reply(res,400,{error:"invalid_workspace"});
    }
    try {
      const result=await pool.query(`SELECT id, objective, workspace FROM agent_responsibilities
        WHERE tenant_id=$1 AND workspace=$2 AND status='active'
        ORDER BY updated_at DESC LIMIT 24`,[tenantId,workspace]);
      if (!Array.isArray(result?.rows)) throw Error("missing_responsibilities");
      const workUnits=result.rows.map(row=>({
        id:row.id, objective:row.objective, priority:"medium",sourceRefs:[]
      }));
      const snapshot=planWorkspaceAgentTasks({
        workspace,tenantId,userId,workUnits,allowedSourceRefs:[]
      });
      return reply(res,200,snapshot);
    } catch {
      // Missing Postgres schema and any runtime transport failure fail closed.
      // No fallback to Cloudflare, global/default tenant or synthetic tasks.
      return reply(res,503,{error:"task_source_unavailable"});
    }
  };
  app.all(PATHS.identity,sessionAuth,handler("identity"));
  app.all(PATHS.tasks,sessionAuth,handler("tasks"));
  return true;
}
