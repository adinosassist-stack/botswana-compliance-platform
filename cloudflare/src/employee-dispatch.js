import {authenticate,roleAllowed,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus} from './agentic-authority-core.js';
import {createEmployeeProposalReviewD1Store,APPROVED_EMPLOYEE_PROVENANCE_SQL} from './employee-proposal-review-d1-store.js';
import {executeEmployeeDispatchedTask} from './agentic-task-execution.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const enabled=env=>env?.THEBE_EMPLOYEE_DISPATCH_ENABLED==='true';

// Verified session identity only; payloads cannot supply tenant, owner or session.
export async function enqueueEmployeeDispatch({env,auth,requestId,permitId,proposalKey}){
 if(!enabled(env))return json({error:'employee_dispatch_disabled'},409);
 if(!auth?.tenant_id||!auth?.user_id||!auth?.token_hash)return json({error:'unauthenticated'},401);
 if(!roleAllowed(auth,'owner'))return json({error:'owner_required'},403);
 if(!validId(requestId)||!validId(permitId)||typeof proposalKey!=='string'||!proposalKey||proposalKey.length>2048)return json({error:'invalid_dispatch_request'},400);
 const source=await createEmployeeProposalReviewD1Store(env.DB).loadApprovedProvenance({tenantId:auth.tenant_id,proposalKey});
 if(!source)return json({error:'approved_employee_provenance_required'},409);
 const id=crypto.randomUUID();
 // This INSERT is also the final authority check. A replay may only return the
 // identical stored binding; it cannot swap an owner, permit or employee source.
 await env.DB.prepare(`INSERT OR IGNORE INTO employee_dispatch_queue(id,tenant_id,request_id,proposal_key,permit_id,owner_id,session_hash)
  SELECT ?,?,?,?,?,?,? WHERE EXISTS (${APPROVED_EMPLOYEE_PROVENANCE_SQL})
  AND EXISTS(SELECT 1 FROM employee_dispatch_controls WHERE tenant_id=? AND enabled=1 AND stopped=0)
  AND EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
   JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id
   WHERE s.token_hash=? AND s.user_id=? AND s.tenant_id=? AND s.expires_at>CURRENT_TIMESTAMP
    AND s.session_generation=u.session_generation AND m.role='owner' AND m.status='active')
  AND EXISTS(SELECT 1 FROM agent_task_requests q
   JOIN agent_jit_execution_permits j ON j.task_request_id=q.id AND j.tenant_id=q.tenant_id
   JOIN audit_events a ON a.entity_id=q.id AND a.tenant_id=q.tenant_id AND a.event_type='AGENT_TASK_PREPARED' AND a.entity_type='agent_task_request'
   WHERE q.id=? AND q.tenant_id=? AND q.status='approved' AND q.approved_by_user_id=? AND q.approved_payload_hash=q.payload_hash
    AND j.id=? AND j.human_user_id=? AND j.payload_hash=q.payload_hash AND j.status='active' AND j.use_count=0
    AND datetime(j.expires_at)>CURRENT_TIMESTAMP AND json_extract(a.event_data,'$.employeeProposal.proposalKey')=?)`).bind(
     id,auth.tenant_id,requestId,proposalKey,permitId,auth.user_id,auth.token_hash,
     auth.tenant_id,proposalKey,auth.tenant_id,auth.token_hash,auth.user_id,auth.tenant_id,
     requestId,auth.tenant_id,auth.user_id,permitId,auth.user_id,proposalKey).run();
 const row=await env.DB.prepare('SELECT id,proposal_key,permit_id,owner_id,session_hash,state FROM employee_dispatch_queue WHERE tenant_id=? AND request_id=?').bind(auth.tenant_id,requestId).first();
 if(!row||row.proposal_key!==proposalKey||row.permit_id!==permitId||row.owner_id!==auth.user_id||row.session_hash!==auth.token_hash)return json({error:'dispatch_authority_or_binding_conflict'},409);
 return json({ok:true,id:row.id,state:row.state,replayed:row.id!==id},row.id===id?201:200);
}

export async function claimEmployeeDispatch(env,{tenantId=null}={}){
 if(!enabled(env))return null;
 // Each expired third attempt is terminal. Audit triggers make recovery atomic.
 await env.DB.prepare(`UPDATE employee_dispatch_queue SET state='dead_letter',lease_token=NULL,lease_until=NULL,last_error='retry_limit'
  WHERE state='leased' AND lease_until<=unixepoch() AND attempts>=3 AND (? IS NULL OR tenant_id=?)`).bind(tenantId,tenantId).run();
 const token=crypto.randomUUID();
 const result=await env.DB.prepare(`UPDATE employee_dispatch_queue SET state='leased',attempts=attempts+1,lease_token=?,lease_until=unixepoch()+45
  WHERE id=(SELECT dq.id FROM employee_dispatch_queue dq JOIN employee_dispatch_controls dc ON dc.tenant_id=dq.tenant_id
   WHERE dc.enabled=1 AND dc.stopped=0 AND (? IS NULL OR dq.tenant_id=?) AND dq.attempts<3
    AND ((dq.state='queued' AND dq.available_at<=unixepoch()) OR (dq.state='leased' AND dq.lease_until<=unixepoch()))
   ORDER BY dq.available_at,dq.id LIMIT 1)
  RETURNING *`).bind(token,tenantId,tenantId).all();
 if(result?.success!==true)throw new Error('dispatch_claim_failed');
 return result.results?.[0]??null;
}

export async function processEmployeeDispatch(env,job){
 if(!enabled(env))return {ok:false,reason:'employee_dispatch_disabled'};
 // Never impersonate a revoked/expired session or a former owner.
 const auth=await env.DB.prepare(`SELECT s.token_hash,s.user_id,s.tenant_id,m.role,u.email FROM sessions s
  JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id
  WHERE s.token_hash=? AND s.user_id=? AND s.tenant_id=? AND s.expires_at>CURRENT_TIMESTAMP
   AND s.session_generation=u.session_generation AND m.status='active' AND m.role='owner'`).bind(job.session_hash,job.owner_id,job.tenant_id).first();
 let response;
 try{response=auth?await executeEmployeeDispatchedTask({env,auth,job}):json({error:'owner_session_inactive'},409)}
 catch{response=json({error:'dispatch_storage_unavailable'},503)}
 if(response.ok)return {ok:true,result:await response.json()};
 const transient=response.status>=500;
 const state=transient&&job.attempts<3?'queued':'dead_letter';
 // A stale worker cannot release another worker's lease or alter a completion.
 // Error codes are fixed categories, never raw database errors or session data.
 await env.DB.prepare(`UPDATE employee_dispatch_queue SET state=?,lease_token=NULL,lease_until=NULL,
  available_at=unixepoch()+?,last_error=? WHERE id=? AND tenant_id=? AND state='leased' AND lease_token=? AND lease_until>unixepoch()`).bind(
   state,10*2**(job.attempts-1),transient?'execution_unavailable':'authority_denied',job.id,job.tenant_id,job.lease_token).run();
 return {ok:false,reason:transient?'execution_unavailable':'authority_denied'};
}

export async function runEmployeeDispatchSweep(env,{tenantId=null,limit=10}={}){
 if(!enabled(env))return {enabled:false,processed:0};
 const count=Number.isInteger(limit)?Math.min(10,Math.max(0,limit)):0;
 let processed=0,completed=0;
 for(let index=0;index<count;index++){
  const job=await claimEmployeeDispatch(env,{tenantId});if(!job)break;
  const result=await processEmployeeDispatch(env,job);processed++;if(result.ok)completed++;
 }
 return {enabled:true,processed,completed};
}

export async function handleEmployeeDispatchRequest({request,logicalPath,env}){
 const path=logicalPath||new URL(request.url).pathname;
 if(path!=='/api/agentic/employee-dispatch')return null;
 const auth=await authenticate(request,env);
 if(!auth)return json({error:'unauthenticated'},401);
 if(!roleAllowed(auth,'owner'))return json({error:'owner_required'},403);
 if(!enabled(env))return json({error:'employee_dispatch_disabled'},409);
 try{
  if(request.method==='GET'){
   const control=await env.DB.prepare('SELECT enabled,stopped,revision FROM employee_dispatch_controls WHERE tenant_id=?').bind(auth.tenant_id).first();
   const queue=await env.DB.prepare('SELECT id,request_id,state,attempts,last_error,result_task_id FROM employee_dispatch_queue WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').bind(auth.tenant_id).all();
   return json({ok:true,control:control??{enabled:0,stopped:1,revision:0},items:queue.results});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(!originAllowed(request,env)||!csrfAllowed(request,auth))return json({error:'csrf_or_origin_failed'},403);
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  if(!body||Array.isArray(body)||typeof body!=='object')return json({error:'invalid_dispatch_request'},400);
  if(body.action==='enqueue'&&Object.keys(body).every(key=>['action','requestId','permitId','proposalKey'].includes(key)))return await enqueueEmployeeDispatch({env,auth,...body});
  if(body.action==='tick'&&Object.keys(body).length===1)return json(await runEmployeeDispatchSweep(env,{tenantId:auth.tenant_id}));
  if(body.action==='stop'&&Object.keys(body).length===2&&Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=0){
   const result=await env.DB.batch([
    env.DB.prepare(`INSERT INTO employee_dispatch_controls(tenant_id)
     SELECT ? WHERE EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
      JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id
      WHERE s.token_hash=? AND s.tenant_id=? AND s.user_id=? AND s.expires_at>CURRENT_TIMESTAMP
       AND s.session_generation=u.session_generation AND m.role='owner' AND m.status='active')
      AND (?=0 OR EXISTS(SELECT 1 FROM employee_dispatch_controls WHERE tenant_id=? AND revision=?))
     ON CONFLICT(tenant_id) DO UPDATE SET enabled=0,stopped=1,revision=employee_dispatch_controls.revision+1
      WHERE employee_dispatch_controls.revision=? RETURNING tenant_id,revision`).bind(auth.tenant_id,auth.token_hash,auth.tenant_id,auth.user_id,
       body.expectedRevision,auth.tenant_id,body.expectedRevision,body.expectedRevision),
    env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
     SELECT ?,?,'EMPLOYEE_DISPATCH_OWNER_STOP','employee_dispatch_controls',?,json_object('expectedRevision',?) WHERE changes()=1`).bind(auth.tenant_id,auth.user_id,auth.tenant_id,body.expectedRevision)
   ]);
   return result[0]?.results?.length===1?json({ok:true,stopped:true}):json({error:'control_revision_conflict'},409);
  }
  return json({error:'invalid_dispatch_request'},400);
 }catch{return json({error:'dispatch_storage_unavailable'},503)}
}
