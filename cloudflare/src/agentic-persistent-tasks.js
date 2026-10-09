import {validatePersistentTaskAllowedTools} from "./agent-tool-trust-registry.js";
import {buildBusinessGoalTask} from "./business-goals.js";
import {authenticate,roleAllowed,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus,safeFirst} from "./agentic-authority-core.js";

export const PERSISTENT_TASK_ENGINE_VERSION="2026-09-25.v1";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const clean=(v,max)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const newId=()=>crypto.randomUUID();
const allowedTrigger=new Set(["scheduled","event","manual"]);
const allowedStatus=new Set(["active","paused","completed","cancelled"]);
function arrayOfStrings(value,max=20){if(!Array.isArray(value)||value.length>max)return null;const out=value.map(v=>clean(v,120)).filter(Boolean);return out.length===value.length?[...new Set(out)]:null}
function plainObject(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{}}
function validIso(value){if(value==null||value==="")return null;const d=new Date(value);return Number.isFinite(d.getTime())?d.toISOString():undefined}
function parseJson(value,fallback){try{return JSON.parse(String(value??""))}catch{return fallback}}
export function normalizePersistentTask(body={}){
  if(!body||typeof body!=="object"||Array.isArray(body))return {error:"invalid_task_payload"};
  if(typeof body.objective!=="string")return {error:"objective_required"};
  const objective=clean(body.objective,500);
  if(!objective)return {error:"objective_required"};
  const triggerKind=clean(body.triggerKind,20)||"manual";
  if(!allowedTrigger.has(triggerKind))return {error:"invalid_trigger_kind"};
  const requestedTools=arrayOfStrings(body.allowedTools??[]);
  if(!requestedTools)return {error:"invalid_allowed_tools"};
  const trustedTools=validatePersistentTaskAllowedTools(requestedTools);
  if(!trustedTools.valid)return {error:trustedTools.code};
  const allowedTools=trustedTools.tools;
  const nextRunAt=validIso(body.nextRunAt);
  if(nextRunAt===undefined)return {error:"invalid_next_run_at"};
  const riskPolicy=plainObject(body.riskPolicy),approvalPolicy=plainObject(body.approvalPolicy),budget=plainObject(body.budget),triggerSpec=plainObject(body.triggerSpec);
  return {payload:{objective,triggerKind,triggerSpec,allowedTools,riskPolicy,approvalPolicy,budget,nextRunAt}};
}
async function ready(env){try{await env.DB.prepare("SELECT COUNT(*) c FROM agent_persistent_tasks").first();return true}catch{return false}}
async function list(env,auth){
  if(!(await ready(env)))return json({error:"persistent_task_schema_not_ready"},503);
  const rows=await env.DB.prepare(`SELECT id,objective,status,trigger_kind,trigger_spec_json,allowed_tools_json,risk_policy_json,approval_policy_json,budget_json,checkpoint_json,next_run_at,last_run_at,created_at,updated_at
    FROM agent_persistent_tasks WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100`).bind(auth.tenant_id).all();
  return json({version:PERSISTENT_TASK_ENGINE_VERSION,tasks:(rows.results||[]).map(r=>({...r,
    triggerSpec:parseJson(r.trigger_spec_json,{}),
    allowedTools:parseJson(r.allowed_tools_json,[]),
    riskPolicy:parseJson(r.risk_policy_json,{}),
    approvalPolicy:parseJson(r.approval_policy_json,{}),
    budget:parseJson(r.budget_json,{}),
    checkpoint:parseJson(r.checkpoint_json,null)
  }))});
}
async function create(request,env,auth){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await ready(env)))return json({error:"persistent_task_schema_not_ready"},503);
  let body;try{body=await readJson(request)}catch(e){return json({error:e.message},requestBodyErrorStatus(e))}
  const n=normalizePersistentTask(body);if(n.error)return json({error:n.error},400);
  const id=newId(),p=n.payload;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO agent_persistent_tasks(id,tenant_id,owner_user_id,objective,trigger_kind,trigger_spec_json,allowed_tools_json,risk_policy_json,approval_policy_json,budget_json,next_run_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,auth.tenant_id,auth.user_id,p.objective,p.triggerKind,JSON.stringify(p.triggerSpec),JSON.stringify(p.allowedTools),JSON.stringify(p.riskPolicy),JSON.stringify(p.approvalPolicy),JSON.stringify(p.budget),p.nextRunAt),
    env.DB.prepare(`INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,'CREATED',?)`).bind(newId(),auth.tenant_id,id,JSON.stringify({ownerUserId:auth.user_id})),
    env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'AGENT_PERSISTENT_TASK_CREATED','agent_persistent_task',?,?)`).bind(auth.tenant_id,auth.user_id,id,JSON.stringify({triggerKind:p.triggerKind,allowedTools:p.allowedTools}))
  ]);
  return json({ok:true,id,status:"active",executionAllowed:false,notice:"Persistent tasks create responsibility state only; every consequential action must still pass Runtime Guard."},201);
}
async function createBusinessGoal(request,env,auth){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await ready(env)))return json({error:"persistent_task_schema_not_ready"},503);
  let body;try{body=await readJson(request)}catch(e){return json({error:e.message},requestBodyErrorStatus(e))}
  const built=buildBusinessGoalTask(body);if(built.error)return json({error:built.error},400);
  const id=newId(),p=built.payload;
  if(Object.prototype.hasOwnProperty.call(body,"maxToolCallsPerRun")&&p.budget.maxToolCallsPerRun<p.allowedTools.length){
    return json({error:"business_goal_tool_budget_too_small",requiredToolCalls:p.allowedTools.length},400);
  }
  const triggerSpec=JSON.stringify({...p.triggerSpec,templateKey:p.templateKey,label:p.label});
  const nextRunAt=new Date().toISOString();
  let inserted;
  try{
    inserted=await env.DB.prepare(`INSERT INTO agent_persistent_tasks(
        id,tenant_id,owner_user_id,objective,trigger_kind,trigger_spec_json,allowed_tools_json,risk_policy_json,approval_policy_json,budget_json,next_run_at
      )
      SELECT ?,?,?,?,?,?,?,?,?,?,?
      WHERE NOT EXISTS (
        SELECT 1 FROM agent_persistent_tasks
        WHERE tenant_id=? AND status IN ('active','paused')
          AND json_extract(CASE WHEN json_valid(trigger_spec_json) THEN trigger_spec_json ELSE '{}' END,'$.templateKey')=?
      )`)
      .bind(id,auth.tenant_id,auth.user_id,p.objective,p.triggerKind,triggerSpec,JSON.stringify(p.allowedTools),JSON.stringify(p.riskPolicy),JSON.stringify(p.approvalPolicy),JSON.stringify(p.budget),nextRunAt,auth.tenant_id,p.templateKey).run();
  }catch(error){
    if(!String(error?.message||error).includes("duplicate_business_goal"))throw error;
    inserted={changes:0};
  }
  const changes=Number(inserted?.meta?.changes??inserted?.changes??0);
  if(changes!==1){
    const existing=await safeFirst(env,`SELECT id,status FROM agent_persistent_tasks
      WHERE tenant_id=? AND status IN ('active','paused')
        AND json_extract(CASE WHEN json_valid(trigger_spec_json) THEN trigger_spec_json ELSE '{}' END,'$.templateKey')=? ORDER BY created_at DESC LIMIT 1`,[auth.tenant_id,p.templateKey]);
    if(existing)return json({ok:true,id:existing.id,status:existing.status,templateKey:p.templateKey,replayed:true,executionAllowed:false,notice:"This goal is already being watched."},200);
    return json({error:"business_goal_create_conflict"},409);
  }
  await env.DB.batch([
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,'BUSINESS_GOAL_CREATED',?)")
      .bind(newId(),auth.tenant_id,id,JSON.stringify({templateKey:p.templateKey,nextRunAt,executionAllowed:false,externalActions:0})),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'AGENT_BUSINESS_GOAL_CREATED','agent_persistent_task',?,?)")
      .bind(auth.tenant_id,auth.user_id,id,JSON.stringify({templateKey:p.templateKey,allowedTools:p.allowedTools,nextRunAt,executionAllowed:false,externalActions:0}))
  ]);
  return json({ok:true,id,status:"active",templateKey:p.templateKey,nextRunAt,executionAllowed:false,notice:"Goal active. Thebe will check the governed sources on schedule; consequential actions still require approval and Runtime Guard."},201);
}
async function transition(env,auth,id,status){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!allowedStatus.has(status))return json({error:"invalid_status"},400);
  const row=await safeFirst(env,"SELECT id,status,next_run_at FROM agent_persistent_tasks WHERE id=? AND tenant_id=? LIMIT 1",[id,auth.tenant_id]);
  if(!row)return json({error:"persistent_task_not_found"},404);
  if(["completed","cancelled"].includes(row.status))return json({error:"terminal_task"},409);
  let result;
  try{
    result=await env.DB.prepare(`UPDATE agent_persistent_tasks
      SET status=?,
          next_run_at=CASE WHEN ?='active' AND next_run_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE next_run_at END,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND status NOT IN ('completed','cancelled')`)
      .bind(status,status,id,auth.tenant_id).run();
  }catch(error){
    if(String(error?.message||error).includes("duplicate_business_goal"))return json({error:"business_goal_duplicate_active"},409);
    throw error;
  }
  if(Number(result?.meta?.changes??result?.changes??0)!==1)return json({error:"persistent_task_transition_conflict"},409);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,?,?)").bind(newId(),auth.tenant_id,id,"STATUS_CHANGED",JSON.stringify({from:row.status,to:status})),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'AGENT_PERSISTENT_TASK_STATUS_CHANGED','agent_persistent_task',?,?)").bind(auth.tenant_id,auth.user_id,id,JSON.stringify({from:row.status,to:status}))
  ]);
  return json({ok:true,id,status});
}
export async function handleAgenticPersistentTaskRequest({request,logicalPath,env}){
  const path=String(logicalPath||"");
  if(!path.startsWith("/api/agentic/persistent-tasks")&&path!=="/api/agentic/business-goals")return null;
  const auth=await authenticate(request,env);if(!auth)return json({error:"unauthorized"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(request.method==="GET"&&path==="/api/agentic/persistent-tasks")return list(env,auth);
  if(!originAllowed(request,env)||!csrfAllowed(request,auth))return json({error:"forbidden"},403);
  if(request.method==="POST"&&path==="/api/agentic/persistent-tasks")return create(request,env,auth);
  if(request.method==="POST"&&path==="/api/agentic/business-goals")return createBusinessGoal(request,env,auth);
  const m=path.match(/^\/api\/agentic\/persistent-tasks\/([^/]+)\/(pause|resume|complete|cancel)$/);
  if(request.method==="POST"&&m){
    const status={pause:"paused",resume:"active",complete:"completed",cancel:"cancelled"}[m[2]];
    return transition(env,auth,clean(m[1],120),status);
  }
  return json({error:"not_found"},404);
}
export const __persistentTaskTest=Object.freeze({normalizePersistentTask,allowedTrigger,allowedStatus,parseJson});
