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
export function normalizePersistentTask(body={}){
  const objective=clean(body.objective,500);
  if(!objective)return {error:"objective_required"};
  const triggerKind=clean(body.triggerKind,20)||"manual";
  if(!allowedTrigger.has(triggerKind))return {error:"invalid_trigger_kind"};
  const allowedTools=arrayOfStrings(body.allowedTools??[]);
  if(!allowedTools)return {error:"invalid_allowed_tools"};
  const nextRunAt=validIso(body.nextRunAt);
  if(nextRunAt===undefined)return {error:"invalid_next_run_at"};
  const riskPolicy=plainObject(body.riskPolicy),approvalPolicy=plainObject(body.approvalPolicy),budget=plainObject(body.budget),triggerSpec=plainObject(body.triggerSpec);
  return {payload:{objective,triggerKind,triggerSpec,allowedTools,riskPolicy,approvalPolicy,budget,nextRunAt}};
}
async function ready(env){try{await env.DB.prepare("SELECT COUNT(*) c FROM agent_persistent_tasks").first();return true}catch{return false}}
async function list(env,auth){
  if(!(await ready(env)))return json({error:"persistent_task_schema_not_ready"},503);
  const rows=await env.DB.prepare(`SELECT id,objective,status,trigger_kind,trigger_spec_json,allowed_tools_json,risk_policy_json,approval_policy_json,budget_json,next_run_at,last_run_at,created_at,updated_at
    FROM agent_persistent_tasks WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100`).bind(auth.tenant_id).all();
  return json({version:PERSISTENT_TASK_ENGINE_VERSION,tasks:(rows.results||[]).map(r=>({...r,triggerSpec:JSON.parse(r.trigger_spec_json||"{}"),allowedTools:JSON.parse(r.allowed_tools_json||"[]"),riskPolicy:JSON.parse(r.risk_policy_json||"{}"),approvalPolicy:JSON.parse(r.approval_policy_json||"{}"),budget:JSON.parse(r.budget_json||"{}")}))});
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
async function transition(env,auth,id,status){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!allowedStatus.has(status)||status==="active"&&false)return json({error:"invalid_status"},400);
  const row=await safeFirst(env,"SELECT id,status FROM agent_persistent_tasks WHERE id=? AND tenant_id=? LIMIT 1",[id,auth.tenant_id]);
  if(!row)return json({error:"persistent_task_not_found"},404);
  if(["completed","cancelled"].includes(row.status))return json({error:"terminal_task"},409);
  const result=await env.DB.prepare("UPDATE agent_persistent_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status NOT IN ('completed','cancelled')").bind(status,id,auth.tenant_id).run();
  if(Number(result?.meta?.changes??result?.changes??0)!==1)return json({error:"persistent_task_transition_conflict"},409);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,?,?)").bind(newId(),auth.tenant_id,id,"STATUS_CHANGED",JSON.stringify({from:row.status,to:status})),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'AGENT_PERSISTENT_TASK_STATUS_CHANGED','agent_persistent_task',?,?)").bind(auth.tenant_id,auth.user_id,id,JSON.stringify({from:row.status,to:status}))
  ]);
  return json({ok:true,id,status});
}
export async function handleAgenticPersistentTaskRequest({request,logicalPath,env}){
  const path=String(logicalPath||"");
  if(!path.startsWith("/api/agentic/persistent-tasks"))return null;
  const auth=await authenticate(request,env);if(!auth)return json({error:"unauthorized"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(request.method==="GET"&&path==="/api/agentic/persistent-tasks")return list(env,auth);
  if(!originAllowed(request,env)||!csrfAllowed(request,auth))return json({error:"forbidden"},403);
  if(request.method==="POST"&&path==="/api/agentic/persistent-tasks")return create(request,env,auth);
  const m=path.match(/^\/api\/agentic\/persistent-tasks\/([^/]+)\/(pause|resume|complete|cancel)$/);
  if(request.method==="POST"&&m){
    const status={pause:"paused",resume:"active",complete:"completed",cancel:"cancelled"}[m[2]];
    return transition(env,auth,clean(m[1],120),status);
  }
  return json({error:"not_found"},404);
}
export const __persistentTaskTest=Object.freeze({normalizePersistentTask,allowedTrigger,allowedStatus});
