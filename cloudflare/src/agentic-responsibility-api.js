import {authenticate,roleAllowed} from "./agentic-authority-core.js";

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const rows=result=>Array.isArray(result?.results)?result.results:[];

export async function handleAgenticResponsibilityRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(path!=="/api/agentic/responsibilities")return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(request.method!=="GET")return json({error:"method_not_allowed"},405);
  try{
    const result=await env.DB.prepare(`SELECT
      id,title,objective,workspace,status,autonomy_ceiling,schedule_kind,schedule_spec,\n      tool_scope_json,data_scope_json,budget_minor,owner_user_id,activated_at,updated_at,\n      (SELECT COUNT(*) FROM agent_responsibility_events e WHERE e.tenant_id=agent_responsibilities.tenant_id AND e.responsibility_id=agent_responsibilities.id) event_count,\n      (SELECT MAX(created_at) FROM agent_responsibility_events e WHERE e.tenant_id=agent_responsibilities.tenant_id AND e.responsibility_id=agent_responsibilities.id) last_event_at
      FROM agent_responsibilities
      WHERE tenant_id=?
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, updated_at DESC
      LIMIT 100`).bind(auth.tenant_id).all();
    return json({items:rows(result).map(row=>({
      id:row.id,title:row.title,objective:row.objective,workspace:row.workspace,status:row.status,
      autonomyCeiling:Number(row.autonomy_ceiling||0),scheduleKind:row.schedule_kind,scheduleSpec:row.schedule_spec||null,
      toolScope:JSON.parse(row.tool_scope_json||"[]"),dataScope:JSON.parse(row.data_scope_json||"[]"),
      budgetMinor:row.budget_minor==null?null:Number(row.budget_minor),ownerUserId:row.owner_user_id,
      activatedAt:row.activated_at||null,updatedAt:row.updated_at,eventCount:Number(row.event_count||0),lastEventAt:row.last_event_at||null
    }))});
  }catch{
    return json({error:"responsibility_schema_unavailable",items:[]},503);
  }
}
