import {authenticate,roleAllowed,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus} from './agentic-authority-core.js';
import {loadCanonicalAgentAuthority,authorityPermitsExecution} from './agent-control-plane.js';
import {executeAgentReadTool} from './agent-read-tools.js';
import {runStandingApprovedTask,validateStandingTaskGrant} from './agentic-task-execution.js';

export const INTERNAL_AUTONOMY_VERSION='internal-autonomy-v1';
const SCOPES=['tasks','drafts','records'];
const SOURCES=['business_health.read','daily_operations_summary.read'];
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const parse=value=>{try{return JSON.parse(value)}catch{return null}};
const uid=()=>crypto.randomUUID();
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const feature=env=>String(env?.THEBE_INTERNAL_AUTONOMY_ENABLED)==='true';
const killed=env=>['1','true','on','yes'].includes(String(env?.AGENT_RUNTIME_KILL_SWITCH||'').toLowerCase());
const enabled=env=>feature(env)&&!killed(env)&&String(env?.AGENT_RUNTIME_ENABLED??'1')!=='0'&&String(env?.AGENT_RUNTIME_BUDGET_STATUS??'within_limit')==='within_limit';
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(object,keys)=>Object.keys(object).every(k=>keys.includes(k));

export function normalizeAutonomyPolicy(body,now=new Date()){
  const deny=()=>({ok:false,error:'invalid_autonomy_policy'});
  if(!plain(body)||!exact(body,['scopes','delegationId','taskTemplate','expiresAt','intervalHours','maxDailyRuns']))return deny();
  const {scopes,expiresAt,delegationId}=body;
  if(!Array.isArray(scopes)||!scopes.length||scopes.length>3||new Set(scopes).size!==scopes.length||scopes.some(s=>!SCOPES.includes(s)))return deny();
  if(typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=+now||Date.parse(expiresAt)>+now+30*86400000)return deny();
  const intervalHours=body.intervalHours??24,maxDailyRuns=body.maxDailyRuns??5;
  if(!Number.isInteger(intervalHours)||intervalHours<1||intervalHours>168||!Number.isInteger(maxDailyRuns)||maxDailyRuns<1||maxDailyRuns>5)return deny();
  let taskTemplate=null;
  if(scopes.includes('tasks')){
    const t=body.taskTemplate;
    if(typeof delegationId!=='string'||!/^[-a-zA-Z0-9_:]{1,120}$/.test(delegationId)||!plain(t)||!exact(t,['title','description','priority']))return deny();
    if(typeof t.title!=='string'||!t.title.trim()||t.title.length>160||/[\u0000-\u001f\u007f]/.test(t.title))return deny();
    if(t.description!=null&&(typeof t.description!=='string'||t.description.length>1200||/[\u0000-\u001f\u007f]/.test(t.description)))return deny();
    if(t.priority!=null&&![1,2,3].includes(t.priority))return deny();
    taskTemplate={title:t.title.trim().replace(/\s+/g,' '),description:t.description?.trim().replace(/\s+/g,' ')||null,priority:t.priority??2,dueAt:null};
  }else if(delegationId!==undefined||body.taskTemplate!==undefined)return deny();
  return {ok:true,value:{scopes:[...scopes],expiresAt:new Date(expiresAt).toISOString(),intervalHours,maxDailyRuns,delegationId:taskTemplate?delegationId:null,taskTemplate}};
}

function storedPolicy(row,now=new Date()){
  const policy=parse(row?.approval_policy_json);
  if(policy?.version!==INTERNAL_AUTONOMY_VERSION||policy.ownerUserId!==row.owner_user_id||policy.tenantId!==row.tenant_id||row.status!=='active')return null;
  const input={scopes:policy.scopes,expiresAt:policy.expiresAt,intervalHours:policy.intervalHours,maxDailyRuns:policy.maxDailyRuns};
  if(policy.scopes?.includes('tasks')){input.delegationId=policy.delegationId;input.taskTemplate={title:policy.taskTemplate?.title,description:policy.taskTemplate?.description,priority:policy.taskTemplate?.priority};}
  const checked=normalizeAutonomyPolicy(input,now);
  if(!checked.ok||JSON.stringify(checked.value.taskTemplate)!==JSON.stringify(policy.taskTemplate))return null;
  return policy;
}

async function ownerFor(env,row){
  return env.DB.prepare("SELECT m.user_id,m.tenant_id,m.role,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.user_id=? AND m.role='owner' AND m.status='active' LIMIT 1").bind(row.tenant_id,row.owner_user_id).first();
}

export async function runInternalAutonomyPolicy(env,row,{now=new Date()}={}){
  if(!enabled(env))return {ok:false,reason:'autonomy_disabled'};
  const policy=storedPolicy(row,now);
  if(!policy||!row.next_run_at||!Number.isFinite(Date.parse(row.next_run_at))||Date.parse(row.next_run_at)>+now)return {ok:false,reason:'policy_inactive_or_not_due'};
  const auth=await ownerFor(env,row);
  if(!auth||!authorityPermitsExecution(await loadCanonicalAgentAuthority(env)))return {ok:false,reason:'authority_unavailable'};
  const occurrence=row.next_run_at,runId=await hash(`${row.id}|${occurrence}`);
  const usage=await env.DB.prepare("SELECT COUNT(*) count FROM agent_persistent_task_events WHERE tenant_id=? AND persistent_task_id=? AND event_type='AUTONOMY_RUN' AND created_at>=date('now')").bind(row.tenant_id,row.id).first();
  if(Number(usage?.count||0)>=policy.maxDailyRuns)return {ok:false,reason:'daily_run_limit'};
  const sources=[];
  for(const key of SOURCES){
    const result=await executeAgentReadTool(key,{env,auth});
    if(!result.allowed||!result.available)return {ok:false,reason:'authoritative_source_unavailable'};
    sources.push({actionKey:key,sourceRef:result.sourceRef,data:result.data});
  }
  const evidence={version:INTERNAL_AUTONOMY_VERSION,observedAt:now.toISOString(),sources};
  if(new TextEncoder().encode(JSON.stringify(evidence)).length>24000)return {ok:false,reason:'evidence_too_large'};
  let task=null;
  if(policy.scopes.includes('tasks')){
    const result=await runStandingApprovedTask({env,auth,policyRow:row,policy,occurrence});
    if(!result.ok)return result;
    task=result.task;
  }
  // One atomic CAS commits the report draft, managed record and audit receipt.
  // The policy is reread at the mutation boundary, including owner membership,
  // expiry, scope bytes, daily budget and canonical agent containment.
  const nextRunAt=new Date(+now+policy.intervalHours*3600000).toISOString();
  const result={runId,standingPolicyId:row.id,scopes:policy.scopes,task,externalActions:0,
    report:policy.scopes.includes('drafts')?{status:'draft',title:'Operations evidence report',...evidence}:null,
    record:policy.scopes.includes('records')?{kind:'managed_operational_summary',status:'observed',...evidence}:null};
  const record=policy.scopes.includes('records')?JSON.stringify(result.record):row.last_verified_state_json;
  const writes=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_persistent_tasks SET next_run_at=?,last_run_at=?,checkpoint_json=?,last_verified_state_json=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND owner_user_id=? AND status='active' AND next_run_at=? AND approval_policy_json=?
      AND json_extract(approval_policy_json,'$.expiresAt')>strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active')
      AND EXISTS(SELECT 1 FROM agent_registry WHERE agent_id='THEBE-001' AND authority_state='active' AND execution_capable=1 AND actor_type='agent')
      AND (SELECT COUNT(*) FROM agent_persistent_task_events WHERE tenant_id=? AND persistent_task_id=? AND event_type='AUTONOMY_RUN' AND created_at>=date('now'))<?`)
      .bind(nextRunAt,now.toISOString(),JSON.stringify({runId,taskId:task?.id||null,status:'completed'}),record??null,row.id,row.tenant_id,row.owner_user_id,occurrence,row.approval_policy_json,row.tenant_id,row.owner_user_id,row.tenant_id,row.id,policy.maxDailyRuns),
    env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) SELECT ?,?,?,'AUTONOMY_RUN',? WHERE changes()=1")
      .bind(runId,row.tenant_id,row.id,JSON.stringify(result)),
    env.DB.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) SELECT ?,?,'AGENT_AUTONOMY_RUN','agent_persistent_task',?,? WHERE changes()=1")
      .bind(row.tenant_id,row.owner_user_id,row.id,JSON.stringify({runId,scopes:policy.scopes,standingAuthorization:true,externalActions:0,agentId:'THEBE-001'}))
  ]);
  if(Number(writes?.[0]?.meta?.changes??writes?.[0]?.changes??0)!==1)return {ok:false,reason:'policy_changed_or_budget_exhausted'};
  return {ok:true,...result};
}

export async function runDueInternalAutonomy(env){
  if(!enabled(env))return {processed:0,enabled:false};
  const rows=await env.DB.prepare(`SELECT * FROM agent_persistent_tasks WHERE status='active' AND trigger_kind='scheduled'
    AND next_run_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND json_valid(approval_policy_json)
    AND json_extract(approval_policy_json,'$.version')=?
    AND json_extract(approval_policy_json,'$.expiresAt')>strftime('%Y-%m-%dT%H:%M:%fZ','now')
    AND EXISTS(SELECT 1 FROM memberships m WHERE m.tenant_id=agent_persistent_tasks.tenant_id AND m.user_id=agent_persistent_tasks.owner_user_id AND m.role='owner' AND m.status='active')
    ORDER BY next_run_at,id LIMIT 10`).bind(INTERNAL_AUTONOMY_VERSION).all();
  let processed=0,denied=0;
  for(const row of rows.results||[]){try{const result=await runInternalAutonomyPolicy(env,row);if(result.ok)processed++;else denied++;}catch{denied++;}}
  return {processed,denied,enabled:true};
}

export async function handleInternalAutonomyRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith('/api/agentic/internal-autonomy'))return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:'unauthenticated'},401);
  if(!roleAllowed(auth,'owner'))return json({error:'owner_required'},403);
  if(!feature(env))return json({error:'autonomy_disabled'},503);
  if(request.method!=='GET'&&(!originAllowed(request,env)||!csrfAllowed(request,auth)))return json({error:'origin_or_csrf_failed'},403);
  try{
    if(path==='/api/agentic/internal-autonomy'&&request.method==='GET'){
      const policies=await env.DB.prepare("SELECT id,status,objective,approval_policy_json,next_run_at,last_run_at,checkpoint_json,last_verified_state_json FROM agent_persistent_tasks WHERE tenant_id=? AND json_valid(approval_policy_json) AND json_extract(approval_policy_json,'$.version')=? ORDER BY created_at DESC LIMIT 20").bind(auth.tenant_id,INTERNAL_AUTONOMY_VERSION).all();
      const events=await env.DB.prepare("SELECT e.id,e.event_data,e.created_at FROM agent_persistent_task_events e JOIN agent_persistent_tasks p ON p.id=e.persistent_task_id AND p.tenant_id=e.tenant_id WHERE e.tenant_id=? AND e.event_type='AUTONOMY_RUN' AND json_extract(p.approval_policy_json,'$.version')=? ORDER BY e.created_at DESC LIMIT 20").bind(auth.tenant_id,INTERNAL_AUTONOMY_VERSION).all();
      return json({enabled:enabled(env),policies:(policies.results||[]).map(p=>({...p,policy:parse(p.approval_policy_json)})),runs:(events.results||[]).map(e=>({id:e.id,createdAt:e.created_at,...parse(e.event_data)}))});
    }
    if(path==='/api/agentic/internal-autonomy'&&request.method==='POST'){
      let body;try{body=await readJson(request)}catch(e){return json({error:e.message},requestBodyErrorStatus(e))}
      const checked=normalizeAutonomyPolicy(body);if(!checked.ok)return json(checked,400);
      if(!enabled(env)||!authorityPermitsExecution(await loadCanonicalAgentAuthority(env)))return json({error:'authority_unavailable'},409);
      if(checked.value.scopes.includes('tasks')&&!await validateStandingTaskGrant(env,auth,checked.value.delegationId))return json({error:'active_task_execution_grant_required'},409);
      const policy={version:INTERNAL_AUTONOMY_VERSION,...checked.value,tenantId:auth.tenant_id,ownerUserId:auth.user_id,approvedAt:new Date().toISOString()};
      policy.templateDigest=await hash(JSON.stringify(policy.taskTemplate));
      const id=uid(),now=new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO agent_persistent_tasks(id,tenant_id,owner_user_id,objective,trigger_kind,trigger_spec_json,allowed_tools_json,risk_policy_json,approval_policy_json,budget_json,next_run_at)
          VALUES(?,?,?,'Thebe internal unattended workflows','scheduled',?,?,?,?,?,?)`)
          .bind(id,auth.tenant_id,auth.user_id,JSON.stringify({internalAutonomy:true}),JSON.stringify(SOURCES),JSON.stringify({externalActions:false,exactTaskTemplate:true}),JSON.stringify(policy),JSON.stringify({maxDailyRuns:policy.maxDailyRuns,maxModelCostMinor:0}),now),
        env.DB.prepare("INSERT INTO agent_persistent_task_events(id,tenant_id,persistent_task_id,event_type,event_data) VALUES(?,?,?,'STANDING_AUTHORIZATION_APPROVED',?)").bind(uid(),auth.tenant_id,id,JSON.stringify(policy)),
        env.DB.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) VALUES(?,?,'AGENT_STANDING_AUTHORIZATION_APPROVED','agent_persistent_task',?,?)").bind(auth.tenant_id,auth.user_id,id,JSON.stringify(policy))
      ]);
      return json({ok:true,id,policy,nextRunAt:now},201);
    }
    const match=path.match(/^\/api\/agentic\/internal-autonomy\/([-\w]+)\/(run|revoke)$/);
    if(match&&request.method==='POST'){
      const row=await env.DB.prepare('SELECT * FROM agent_persistent_tasks WHERE id=? AND tenant_id=? AND owner_user_id=? LIMIT 1').bind(match[1],auth.tenant_id,auth.user_id).first();
      if(!row||parse(row.approval_policy_json)?.version!==INTERNAL_AUTONOMY_VERSION)return json({error:'policy_not_found'},404);
      if(match[2]==='run'){const result=await runInternalAutonomyPolicy(env,row);return json(result,result.ok?200:409);}
      await env.DB.batch([
        env.DB.prepare("UPDATE agent_persistent_tasks SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status IN ('active','paused')").bind(row.id,auth.tenant_id),
        env.DB.prepare("INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data) SELECT ?,?,'AGENT_STANDING_AUTHORIZATION_REVOKED','agent_persistent_task',?,'{}' WHERE changes()=1").bind(auth.tenant_id,auth.user_id,row.id)
      ]);
      return json({ok:true,status:'cancelled'});
    }
    return json({error:'method_not_allowed'},405);
  }catch{return json({error:'internal_autonomy_unavailable'},503)}
}

export const __internalAutonomyTest=Object.freeze({storedPolicy,enabled});
