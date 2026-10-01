import {AGENT_ACTION_CATALOG} from "./agent-policy.js";
import {evaluateAgentRuntimeGuard} from "./agent-runtime-guard.js";
import {normalizeDelegation} from "./delegated-authority.js";
import {
  authenticate,roleAllowed,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus,safeFirst
} from "./agentic-authority-core.js";
import {THEBE_AGENT_ID,loadCanonicalAgentAuthority,authorityPermitsExecution} from "./agent-control-plane.js";

const MAX_TITLE=160;
const MAX_DESCRIPTION=1200;
const ACTION_KEY="task.create";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const text=(value,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const id=()=>crypto.randomUUID();

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function envTrue(value){return ["1","true","on","yes"].includes(String(value??"").trim().toLowerCase())}
function executionMode(env){
  if(envTrue(env?.AGENT_BOUNDED_TASK_EXECUTION_ENABLED))return "global";
  const mode=String(env?.AGENT_BOUNDED_TASK_EXECUTION_MODE||"off").trim().toLowerCase();
  return ["off","platform_admin_canary","global"].includes(mode)?mode:"off";
}
function platformAdminEmails(env){
  return new Set(String(env?.PLATFORM_ADMIN_EMAILS||"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean));
}
function sessionExecutionEnabled(env,auth){
  const mode=executionMode(env);
  if(mode==="global")return true;
  if(mode!=="platform_admin_canary")return false;
  const email=String(auth?.email||"").trim().toLowerCase();
  return roleAllowed(auth,"owner")&&!!email&&platformAdminEmails(env).has(email);
}
function globalExecutionEnabled(env){return executionMode(env)==="global"}
function runtimeKillSwitch(env){return envTrue(env?.AGENT_RUNTIME_KILL_SWITCH)}
function runtimeAgentStatus(env){return String(env?.AGENT_RUNTIME_ENABLED||"1")==="0"?"disabled":"enabled"}
function runtimeBudgetStatus(env){return String(env?.AGENT_RUNTIME_BUDGET_STATUS||"within_limit")}

function validIso(value){
  if(value==null||value==="")return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toISOString():undefined;
}

function normalizeTaskPayload(body={}){
  const title=text(body?.title,MAX_TITLE);
  if(!title)return {error:"task_title_required"};
  const description=text(body?.description,MAX_DESCRIPTION)||null;
  const priority=body?.priority==null?2:Number(body.priority);
  if(!Number.isInteger(priority)||priority<1||priority>3)return {error:"invalid_task_priority"};
  const dueAt=validIso(body?.dueAt);
  if(dueAt===undefined)return {error:"invalid_task_due_at"};
  return {payload:Object.freeze({title,description,priority,dueAt})};
}

function canonicalIntentPayload({payload,runId=null,proposalId=null,humanConfirmed=false}){
  return JSON.stringify({
    agentKey:"thebe",
    actionKey:ACTION_KEY,
    amountMinor:0,
    humanConfirmed:Boolean(humanConfirmed),
    runId:runId||null,
    proposalId:proposalId||null,
    metadata:{
      title:payload.title,
      description:payload.description,
      priority:payload.priority,
      dueAt:payload.dueAt
    }
  });
}

async function schemaReady(env){
  try{
    await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM agent_execution_grants) grant_count,
      (SELECT COUNT(*) FROM agent_task_requests) request_count,
      (SELECT COUNT(*) FROM agent_internal_tasks) task_count,
      (SELECT COUNT(*) FROM agent_execution_receipts) receipt_count,
      (SELECT COUNT(*) FROM agent_jit_execution_permits) jit_permit_count`).first();
    return true;
  }catch{return false}
}

async function loadExecutionGrant(env,tenantId,delegationId){
  const row=await safeFirst(env,`SELECT d.*,g.id execution_grant_id,g.status execution_grant_status
    FROM agent_delegations d
    JOIN agent_execution_grants g ON g.delegation_id=d.id AND g.tenant_id=d.tenant_id
    WHERE d.id=? AND d.tenant_id=? AND d.agent_key='thebe' AND d.action_key=? AND d.status='active'
      AND d.max_autonomy_level>=3 AND d.external_side_effects=0 AND d.human_confirmation_required=1
      AND (d.valid_from IS NULL OR d.valid_from<=CURRENT_TIMESTAMP)
      AND (d.expires_at IS NULL OR d.expires_at>CURRENT_TIMESTAMP)
      AND g.status='active'
    LIMIT 1`,[delegationId,tenantId,ACTION_KEY]);
  if(!row)return null;
  return Object.freeze({
    row,
    executionGrantId:String(row.execution_grant_id),
    delegation:Object.freeze({...normalizeDelegation(row),shadowOnly:false})
  });
}

async function status(env,auth){
  const ready=await schemaReady(env);
  let activeGrants=[],openTasks=0;
  if(ready){
    const grants=await env.DB.prepare(`SELECT g.id,g.delegation_id,g.created_at
      FROM agent_execution_grants g
      JOIN agent_delegations d ON d.id=g.delegation_id AND d.tenant_id=g.tenant_id
      WHERE g.tenant_id=? AND g.action_key=? AND g.status='active'
        AND d.status='active'
        AND (d.valid_from IS NULL OR d.valid_from<=CURRENT_TIMESTAMP)
        AND (d.expires_at IS NULL OR d.expires_at>CURRENT_TIMESTAMP)
      ORDER BY g.created_at DESC LIMIT 10`).bind(auth.tenant_id,ACTION_KEY).all();
    const tasks=await safeFirst(env,`SELECT COUNT(*) count FROM agent_internal_tasks WHERE tenant_id=? AND status='open'`,[auth.tenant_id]);
    activeGrants=(grants.results||[]).map(row=>({id:row.id,delegationId:row.delegation_id,createdAt:row.created_at}));
    openTasks=Number(tasks?.count||0);
  }
  const mode=executionMode(env);
  const canonicalAuthority=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
  const sessionEnabled=sessionExecutionEnabled(env,auth)&&authorityPermitsExecution(canonicalAuthority);
  return json({
    enabled:true,
    schemaReady:ready,
    controlPlaneReady:canonicalAuthority.ready,
    agentAuthority:{agentId:canonicalAuthority.agentId,state:canonicalAuthority.state,executionCapable:canonicalAuthority.executionCapable,reason:canonicalAuthority.reason},
    actionKey:ACTION_KEY,
    executionMode:mode,
    sessionExecutionEnabled:sessionEnabled,
    globalExecutionEnabled:mode==="global"&&authorityPermitsExecution(canonicalAuthority),
    platformAdminCanary:mode==="platform_admin_canary",
    runtimeKillSwitch:runtimeKillSwitch(env),
    activeExecutionGrants:activeGrants.length,
    activeGrants,
    openTasks,
    guarantees:["task_create_only","no_external_side_effect","explicit_owner_approval","payload_hash_binding","idempotent_execution","runtime_guard_required","canonical_agent_containment_required","platform_admin_canary_is_owner_only","single_use_jit_permit_required","same_owner_jit_execution"]
  });
}

async function createExecutionGrant({request,env,auth}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const canonicalAuthority=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
  if(!authorityPermitsExecution(canonicalAuthority)){
    return json({error:"agent_authority_contained",authority:{agentId:canonicalAuthority.agentId,state:canonicalAuthority.state,reason:canonicalAuthority.reason}},canonicalAuthority.ready?409:503);
  }
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const delegationId=text(body?.delegationId,120);
  if(!delegationId)return json({error:"delegation_id_required"},400);
  const delegation=await safeFirst(env,`SELECT id,tenant_id,agent_key,action_key,status,max_autonomy_level,external_side_effects,human_confirmation_required,valid_from,expires_at
    FROM agent_delegations WHERE id=? AND tenant_id=?
      AND (valid_from IS NULL OR valid_from<=CURRENT_TIMESTAMP)
      AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)
    LIMIT 1`,[delegationId,auth.tenant_id]);
  if(!delegation)return json({error:"delegation_not_found"},404);
  if(String(delegation.agent_key)!=="thebe"||String(delegation.action_key)!==ACTION_KEY)return json({error:"delegation_not_eligible"},409);
  if(String(delegation.status)!=="active"||Number(delegation.max_autonomy_level)<3||Number(delegation.external_side_effects)!==0||Number(delegation.human_confirmation_required)!==1){
    return json({error:"delegation_not_eligible"},409);
  }
  const existing=await safeFirst(env,`SELECT id,status FROM agent_execution_grants WHERE tenant_id=? AND delegation_id=? LIMIT 1`,[auth.tenant_id,delegationId]);
  if(existing){
    if(existing.status==="active")return json({error:"active_execution_grant_exists",executionGrantId:existing.id},409);
    return json({error:"execution_grant_revoked_permanently",executionGrantId:existing.id},409);
  }
  const grantId=id();
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO agent_execution_grants(id,tenant_id,delegation_id,action_key,status,approved_by_user_id)
        VALUES(?,?,?,?,'active',?)`).bind(grantId,auth.tenant_id,delegationId,ACTION_KEY,auth.user_id),
      env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
        VALUES(?,?,'AGENT_EXECUTION_GRANT_CREATED','agent_execution_grant',?,?)`).bind(
          auth.tenant_id,auth.user_id,grantId,JSON.stringify({delegationId,actionKey:ACTION_KEY,executionMode:executionMode(env),sessionExecutionEnabled:sessionExecutionEnabled(env,auth)})
        )
    ]);
  }catch{return json({error:"execution_grant_create_failed"},500)}
  return json({ok:true,executionGrant:{id:grantId,delegationId,actionKey:ACTION_KEY,status:"active"},executionMode:executionMode(env),sessionExecutionEnabled:sessionExecutionEnabled(env,auth)},201);
}

async function revokeExecutionGrant({env,auth,grantId}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const result=await env.DB.prepare(`UPDATE agent_execution_grants SET status='revoked',revoked_at=CURRENT_TIMESTAMP
    WHERE id=? AND tenant_id=? AND status='active'`).bind(grantId,auth.tenant_id).run();
  const changed=Number(result?.meta?.changes??result?.changes??0);
  if(changed!==1){
    const current=await safeFirst(env,`SELECT status FROM agent_execution_grants WHERE id=? AND tenant_id=? LIMIT 1`,[grantId,auth.tenant_id]);
    if(!current)return json({error:"execution_grant_not_found"},404);
    return json({error:"execution_grant_already_revoked"},409);
  }
  await env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
    VALUES(?,?,'AGENT_EXECUTION_GRANT_REVOKED','agent_execution_grant',?,'{}')`).bind(auth.tenant_id,auth.user_id,grantId).run();
  return json({ok:true,id:grantId,status:"revoked"});
}

async function prepareTask({request,env,auth}){
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const idem=text(request.headers.get("idempotency-key"),200);
  if(idem.length<8)return json({error:"idempotency_key_required"},400);
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const normalized=normalizeTaskPayload(body);
  if(normalized.error)return json({error:normalized.error},400);
  const delegationId=text(body?.delegationId,120);
  if(!delegationId)return json({error:"delegation_id_required"},400);
  const authority=await loadExecutionGrant(env,auth.tenant_id,delegationId);
  if(!authority)return json({error:"active_task_execution_grant_required"},409);

  const runId=body?.runId?text(body.runId,120):null;
  const proposalId=body?.proposalId?text(body.proposalId,120):null;
  if(runId&&!await safeFirst(env,"SELECT id FROM agentic_runs WHERE id=? AND tenant_id=? LIMIT 1",[runId,auth.tenant_id]))return json({error:"run_not_found"},404);
  if(proposalId&&!await safeFirst(env,"SELECT id FROM agentic_proposals WHERE id=? AND tenant_id=? LIMIT 1",[proposalId,auth.tenant_id]))return json({error:"proposal_not_found"},404);

  const canonical=canonicalIntentPayload({payload:normalized.payload,runId,proposalId,humanConfirmed:false});
  const payloadHash=await sha256Hex(canonical);
  const existing=await safeFirst(env,`SELECT i.id intent_id,i.payload_hash,r.id request_id,r.status,r.payload_json,r.approved_payload_hash,r.created_at
    FROM agent_action_intents i LEFT JOIN agent_task_requests r ON r.action_intent_id=i.id AND r.tenant_id=i.tenant_id
    WHERE i.tenant_id=? AND i.idempotency_key=? LIMIT 1`,[auth.tenant_id,idem]);
  if(existing){
    if(String(existing.payload_hash)!==payloadHash||!existing.request_id)return json({error:"idempotency_key_conflict"},409);
    return json({ok:true,replayed:true,request:{id:existing.request_id,status:existing.status,payload:JSON.parse(existing.payload_json||"{}"),createdAt:existing.created_at},execution:{performed:false,enabled:globalExecutionEnabled(env)}});
  }

  const intentId=id(),requestId=id();
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO agent_action_intents(id,tenant_id,run_id,proposal_id,agent_key,action_key,requested_by_user_id,delegation_id,mode,decision,decision_code,
        required_autonomy_level,amount_minor,payload_hash,idempotency_key,status)
        VALUES(?,?,?,?, 'thebe',?,?,?,'shadow','review_required','human_confirmation_required',3,0,?,?,'review_required')`).bind(
          intentId,auth.tenant_id,runId,proposalId,ACTION_KEY,auth.user_id,delegationId,payloadHash,idem
        ),
      env.DB.prepare(`INSERT INTO agent_task_requests(id,tenant_id,action_intent_id,delegation_id,execution_grant_id,requested_by_user_id,payload_json,payload_hash,status)
        VALUES(?,?,?,?,?,?,?,?,'prepared')`).bind(
          requestId,auth.tenant_id,intentId,delegationId,authority.executionGrantId,auth.user_id,JSON.stringify(normalized.payload),payloadHash
        ),
      env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
        VALUES(?,?,'AGENT_TASK_PREPARED','agent_task_request',?,?)`).bind(
          auth.tenant_id,auth.user_id,requestId,JSON.stringify({intentId,delegationId,executionGrantId:authority.executionGrantId,payloadHash})
        )
    ]);
  }catch{
    const replay=await safeFirst(env,`SELECT i.payload_hash,r.id request_id,r.status,r.payload_json
      FROM agent_action_intents i JOIN agent_task_requests r ON r.action_intent_id=i.id AND r.tenant_id=i.tenant_id
      WHERE i.tenant_id=? AND i.idempotency_key=? LIMIT 1`,[auth.tenant_id,idem]);
    if(replay&&String(replay.payload_hash)===payloadHash)return json({ok:true,replayed:true,request:{id:replay.request_id,status:replay.status,payload:JSON.parse(replay.payload_json||"{}")},execution:{performed:false,enabled:globalExecutionEnabled(env)}});
    return json({error:"task_prepare_failed"},500);
  }
  return json({ok:true,replayed:false,request:{id:requestId,status:"prepared",payload:normalized.payload,payloadHash},approvalRequired:true,execution:{performed:false,enabled:globalExecutionEnabled(env)}},201);
}

async function approveTask({env,auth,requestId}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_approval_required"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const current=await safeFirst(env,`SELECT id,status,payload_hash,approved_payload_hash FROM agent_task_requests WHERE id=? AND tenant_id=? LIMIT 1`,[requestId,auth.tenant_id]);
  if(!current)return json({error:"task_request_not_found"},404);
  if(current.status==="approved"||current.status==="executed")return json({ok:true,id:requestId,status:current.status,replayed:true});
  if(current.status!=="prepared")return json({error:"task_request_not_approvable",status:current.status},409);
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_task_requests SET status='approved',approved_payload_hash=payload_hash,approved_by_user_id=?,approved_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND status='prepared'`).bind(auth.user_id,requestId,auth.tenant_id),
    env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
      SELECT ?,?,'AGENT_TASK_APPROVED','agent_task_request',?,? WHERE changes()=1`).bind(
        auth.tenant_id,auth.user_id,requestId,JSON.stringify({payloadHash:String(current.payload_hash)})
      )
  ]);
  const changed=Number(results?.[0]?.meta?.changes??results?.[0]?.changes??0);
  if(changed!==1)return json({error:"task_request_approval_conflict"},409);
  return json({ok:true,id:requestId,status:"approved",payloadHash:String(current.payload_hash)});
}

async function listTaskRequests(env,auth){
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const rows=await env.DB.prepare(`SELECT q.id,q.status,q.payload_json,q.payload_hash,q.approved_payload_hash,
      q.delegation_id,q.execution_grant_id,q.approved_at,q.executed_at,q.created_at,
      i.run_id,i.proposal_id
    FROM agent_task_requests q
    JOIN agent_action_intents i ON i.id=q.action_intent_id AND i.tenant_id=q.tenant_id
    WHERE q.tenant_id=?
    ORDER BY q.created_at DESC
    LIMIT 50`).bind(auth.tenant_id).all();
  return json({items:(rows.results||[]).map(row=>{
    let payload={};
    try{payload=JSON.parse(String(row.payload_json||"{}"))}catch{}
    return {
      id:row.id,
      status:row.status,
      payload,
      payloadHash:row.payload_hash,
      approvedPayloadHash:row.approved_payload_hash||null,
      delegationId:row.delegation_id,
      executionGrantId:row.execution_grant_id,
      runId:row.run_id||null,
      proposalId:row.proposal_id||null,
      approvedAt:row.approved_at||null,
      executedAt:row.executed_at||null,
      createdAt:row.created_at
    };
  })});
}

async function cancelTask({env,auth,requestId}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const current=await safeFirst(env,`SELECT id,status,payload_hash FROM agent_task_requests WHERE id=? AND tenant_id=? LIMIT 1`,[requestId,auth.tenant_id]);
  if(!current)return json({error:"task_request_not_found"},404);
  if(current.status==="cancelled")return json({ok:true,id:requestId,status:"cancelled",replayed:true});
  if(current.status==="executed")return json({error:"task_request_already_executed"},409);
  if(!["prepared","approved"].includes(String(current.status||"")))return json({error:"task_request_not_cancellable",status:current.status},409);
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agent_task_requests SET status='cancelled'
      WHERE id=? AND tenant_id=? AND status IN ('prepared','approved')`).bind(requestId,auth.tenant_id),
    env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
      SELECT ?,?,'AGENT_TASK_CANCELLED','agent_task_request',?,? WHERE changes()=1`).bind(
        auth.tenant_id,auth.user_id,requestId,JSON.stringify({previousStatus:String(current.status),payloadHash:String(current.payload_hash||"")})
      )
  ]);
  const changed=Number(results?.[0]?.meta?.changes??results?.[0]?.changes??0);
  if(changed!==1)return json({error:"task_request_cancel_conflict"},409);
  return json({ok:true,id:requestId,status:"cancelled"});
}

async function issueJitPermit({env,auth,requestId}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const canonicalAuthority=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
  if(!authorityPermitsExecution(canonicalAuthority))return json({error:"agent_authority_contained"},canonicalAuthority.ready?409:503);
  if(!sessionExecutionEnabled(env,auth))return json({error:"execution_session_disabled"},409);
  const row=await safeFirst(env,`SELECT q.id,q.status,q.payload_hash,q.approved_payload_hash,q.approved_by_user_id,q.execution_grant_id,g.status execution_grant_status
    FROM agent_task_requests q JOIN agent_execution_grants g ON g.id=q.execution_grant_id AND g.tenant_id=q.tenant_id
    WHERE q.id=? AND q.tenant_id=? LIMIT 1`,[requestId,auth.tenant_id]);
  if(!row)return json({error:"task_request_not_found"},404);
  if(row.status!=="approved"||String(row.approved_payload_hash||"")!==String(row.payload_hash||""))return json({error:"exact_owner_approval_required"},409);
  if(String(row.approved_by_user_id||"")!==String(auth.user_id))return json({error:"same_owner_approval_required"},409);
  if(row.execution_grant_status!=="active")return json({error:"execution_grant_inactive"},409);
  const existing=await safeFirst(env,`SELECT id,status,expires_at FROM agent_jit_execution_permits WHERE tenant_id=? AND task_request_id=? LIMIT 1`,[auth.tenant_id,requestId]);
  if(existing)return json({error:"jit_permit_already_issued",permitId:existing.id,status:existing.status,expiresAt:existing.expires_at},409);
  const permitId=id(),expiresAt=new Date(Date.now()+5*60*1000).toISOString();
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO agent_jit_execution_permits(id,tenant_id,agent_id,human_user_id,task_request_id,execution_grant_id,action_key,payload_hash,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(permitId,auth.tenant_id,THEBE_AGENT_ID,auth.user_id,requestId,row.execution_grant_id,ACTION_KEY,row.payload_hash,expiresAt),
      env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
        VALUES(?,?,'AGENT_JIT_PERMIT_ISSUED','agent_jit_execution_permit',?,?)`).bind(auth.tenant_id,auth.user_id,permitId,JSON.stringify({requestId,agentId:THEBE_AGENT_ID,actionKey:ACTION_KEY,payloadHash:row.payload_hash,expiresAt,maxUses:1}))
    ]);
  }catch{return json({error:"jit_permit_issue_failed"},500)}
  return json({ok:true,permit:{id:permitId,requestId,agentId:THEBE_AGENT_ID,actionKey:ACTION_KEY,payloadHash:row.payload_hash,expiresAt,maxUses:1}},201);
}

async function executeTask({env,auth,requestId,permitId}){
  if(!roleAllowed(auth,"owner"))return json({error:"owner_required"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const canonicalAuthority=await loadCanonicalAgentAuthority(env,THEBE_AGENT_ID);
  if(!authorityPermitsExecution(canonicalAuthority)){
    try{
      await env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
        VALUES(?,?,'AGENT_EXECUTION_CONTAINED','agent_registry',?,?)`).bind(
          auth.tenant_id,auth.user_id,canonicalAuthority.agentId,JSON.stringify({requestId,state:canonicalAuthority.state,reason:canonicalAuthority.reason,controlPlane:"v154"})
        ).run();
    }catch{}
    return json({error:"agent_authority_contained",authority:{agentId:canonicalAuthority.agentId,state:canonicalAuthority.state,reason:canonicalAuthority.reason}},canonicalAuthority.ready?409:503);
  }

  const row=await safeFirst(env,`SELECT q.id request_id,q.status request_status,q.payload_json,q.payload_hash,q.approved_payload_hash,q.approved_by_user_id,q.delegation_id,q.execution_grant_id,
      q.requested_by_user_id,q.jit_permit_id,i.id intent_id,i.agent_key,i.action_key,i.run_id,i.proposal_id,
      d.*,g.status execution_grant_status
    FROM agent_task_requests q
    JOIN agent_action_intents i ON i.id=q.action_intent_id AND i.tenant_id=q.tenant_id
    JOIN agent_delegations d ON d.id=q.delegation_id AND d.tenant_id=q.tenant_id
    JOIN agent_execution_grants g ON g.id=q.execution_grant_id AND g.tenant_id=q.tenant_id
    WHERE q.id=? AND q.tenant_id=? LIMIT 1`,[requestId,auth.tenant_id]);
  if(!row)return json({error:"task_request_not_found"},404);
  if(row.request_status!=="approved")return json({error:"task_request_not_approved",status:row.request_status},409);
  if(String(row.approved_payload_hash||"")!==String(row.payload_hash||""))return json({error:"exact_owner_approval_required"},409);
  if(String(row.approved_by_user_id||"")!==String(auth.user_id))return json({error:"same_owner_execution_required"},409);
  if(row.execution_grant_status!=="active")return json({error:"execution_grant_inactive"},409);
  const jitPermitId=text(permitId,120);
  if(!jitPermitId)return json({error:"jit_permit_required"},409);
  const permit=await safeFirst(env,`SELECT id,agent_id,human_user_id,task_request_id,execution_grant_id,action_key,payload_hash,status,max_uses,use_count,expires_at
    FROM agent_jit_execution_permits WHERE id=? AND tenant_id=? LIMIT 1`,[jitPermitId,auth.tenant_id]);
  if(!permit||
    String(permit.agent_id)!==THEBE_AGENT_ID||
    String(permit.human_user_id)!==String(auth.user_id)||
    String(permit.task_request_id)!==String(requestId)||
    String(permit.execution_grant_id)!==String(row.execution_grant_id)||
    String(permit.action_key)!==ACTION_KEY||
    String(permit.payload_hash)!==String(row.payload_hash)||
    String(permit.status)!=="active"||
    Number(permit.max_uses)!==1||
    Number(permit.use_count)!==0||
    !permit.expires_at||
    new Date(permit.expires_at).getTime()<=Date.now()){
    return json({error:"jit_permit_invalid_or_expired"},409);
  }
  const payload=JSON.parse(row.payload_json||"{}");
  const authority=Object.freeze({...normalizeDelegation(row),shadowOnly:false});
  const usage=await safeFirst(env,`SELECT COUNT(*) count FROM agent_execution_receipts WHERE tenant_id=? AND execution_grant_id=? AND created_at>=date('now')`,[auth.tenant_id,row.execution_grant_id]);
  const decision=evaluateAgentRuntimeGuard({
    agentKey:"thebe",
    actionKey:ACTION_KEY,
    actorRole:String(auth.role||"").toLowerCase(),
    tenantScoped:true,
    tenantId:String(auth.tenant_id),
    actorTenantId:String(auth.tenant_id),
    targetTenantId:String(auth.tenant_id),
    agentStatus:runtimeAgentStatus(env),
    killSwitchActive:runtimeKillSwitch(env),
    budgetStatus:runtimeBudgetStatus(env),
    approvalState:"approved",
    approvalPayloadHash:String(row.approved_payload_hash||""),
    actionPayloadHash:String(row.payload_hash||""),
    delegation:authority,
    mode:"execute",
    globalExecutionEnabled:sessionExecutionEnabled(env,auth)&&authorityPermitsExecution(canonicalAuthority),
    amountMinor:0,
    dailyActionCount:Number(usage?.count||0),
    phase:"bounded_v1"
  });
  if(decision.allowed!==true||decision.executionAllowed!==true){
    try{
      await env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
        VALUES(?,?,'AGENT_TASK_EXECUTION_DENIED','agent_task_request',?,?)`).bind(
          auth.tenant_id,auth.user_id,requestId,JSON.stringify({intentId:row.intent_id,executionGrantId:row.execution_grant_id,code:decision.code,guardVersion:decision.guardVersion,executionMode:executionMode(env)})
        ).run();
    }catch{}
    return json({error:"task_execution_denied",decision:{code:decision.code,reason:decision.reason,guardVersion:decision.guardVersion}},409);
  }

  const taskId=id(),receiptId=id();
  try{
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE agent_task_requests
        SET status='executed',executed_at=CURRENT_TIMESTAMP,jit_permit_id=?
        WHERE id=? AND tenant_id=? AND status='approved' AND approved_payload_hash=payload_hash AND approved_by_user_id=? AND jit_permit_id IS NULL`).bind(
          jitPermitId,requestId,auth.tenant_id,auth.user_id
        ),
      env.DB.prepare(`INSERT INTO agent_internal_tasks(id,tenant_id,title,description,priority,due_at,status,source_request_id,source_intent_id,execution_grant_id,requested_by_user_id,created_by_agent_key)
        SELECT ?,?,?,?,?,?,'open',?,?,?,?, 'thebe' WHERE changes()=1`).bind(
          taskId,auth.tenant_id,text(payload.title,MAX_TITLE),text(payload.description,MAX_DESCRIPTION)||null,Number(payload.priority||2),payload.dueAt||null,
          requestId,row.intent_id,row.execution_grant_id,row.requested_by_user_id
        ),
      env.DB.prepare(`INSERT INTO agent_execution_receipts(id,tenant_id,action_intent_id,execution_grant_id,action_key,payload_hash,result_entity_type,result_entity_id,status)
        SELECT ?,?,?,?,?,?,'agent_internal_task',?,'succeeded' WHERE changes()=1`).bind(
          receiptId,auth.tenant_id,row.intent_id,row.execution_grant_id,ACTION_KEY,row.payload_hash,taskId
        ),
      env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
        SELECT ?,?,'AGENT_TASK_EXECUTED','agent_internal_task',?,? WHERE changes()=1`).bind(
          auth.tenant_id,auth.user_id,taskId,JSON.stringify({requestId,intentId:row.intent_id,executionGrantId:row.execution_grant_id,jitPermitId,payloadHash:row.payload_hash,guardVersion:decision.guardVersion,executionMode:executionMode(env)})
        )
    ]);
    const changed=Number(results?.[0]?.meta?.changes??results?.[0]?.changes??0);
    if(changed!==1)throw new Error("execution_conflict");
  }catch{
    const permitState=await safeFirst(env,`SELECT status,use_count,consumed_by_user_id,consumed_at FROM agent_jit_execution_permits WHERE id=? AND tenant_id=? LIMIT 1`,[jitPermitId,auth.tenant_id]);
    if(String(permitState?.status||"")==="consumed"||Number(permitState?.use_count||0)>=1){
      return json({error:"jit_permit_already_consumed"},409);
    }
    return json({error:"task_execution_failed"},500);
  }

  const verified=await safeFirst(env,`SELECT t.id task_id,t.title,t.description,t.priority,t.due_at,t.status,t.created_at,r.id receipt_id
    FROM agent_internal_tasks t JOIN agent_execution_receipts r ON r.result_entity_id=t.id AND r.tenant_id=t.tenant_id
    WHERE t.id=? AND t.tenant_id=? AND t.source_request_id=? AND r.action_intent_id=? LIMIT 1`,[taskId,auth.tenant_id,requestId,row.intent_id]);
  if(!verified)return json({error:"task_execution_verification_failed",taskId,receiptId},500);

  return json({ok:true,replayed:false,task:{id:verified.task_id,title:verified.title,description:verified.description,priority:verified.priority,dueAt:verified.due_at,status:verified.status,createdAt:verified.created_at},receiptId:verified.receipt_id,jitPermitId,guard:{version:decision.guardVersion,code:decision.code},verified:true},201);
}

async function listTasks(env,auth){
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(!(await schemaReady(env)))return json({error:"bounded_execution_schema_not_ready"},503);
  const rows=await env.DB.prepare(`SELECT id,title,description,priority,due_at,status,created_at,updated_at
    FROM agent_internal_tasks WHERE tenant_id=? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,priority ASC,due_at ASC,created_at DESC LIMIT 100`).bind(auth.tenant_id).all();
  return json({items:(rows.results||[]).map(row=>({id:row.id,title:row.title,description:row.description,priority:row.priority,dueAt:row.due_at,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at}))});
}

export async function handleAgenticTaskExecutionRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/task-execution"))return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager","reviewer"))return json({error:"forbidden"},403);
  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }

  if(path==="/api/agentic/task-execution/status"&&request.method==="GET")return status(env,auth);
  if(path==="/api/agentic/task-execution/grants"&&request.method==="POST")return createExecutionGrant({request,env,auth});
  const revoke=path.match(/^\/api\/agentic\/task-execution\/grants\/([^/]+)\/revoke$/);
  if(revoke&&request.method==="POST")return revokeExecutionGrant({env,auth,grantId:revoke[1]});
  if(path==="/api/agentic/task-execution/prepare"&&request.method==="POST")return prepareTask({request,env,auth});
  if(path==="/api/agentic/task-execution/requests"&&request.method==="GET")return listTaskRequests(env,auth);
  const cancel=path.match(/^\/api\/agentic\/task-execution\/requests\/([^/]+)\/cancel$/);
  if(cancel&&request.method==="POST")return cancelTask({env,auth,requestId:cancel[1]});
  const approve=path.match(/^\/api\/agentic\/task-execution\/requests\/([^/]+)\/approve$/);
  if(approve&&request.method==="POST")return approveTask({env,auth,requestId:approve[1]});
  const permit=path.match(/^\/api\/agentic\/task-execution\/requests\/([^/]+)\/jit-permit$/);
  if(permit&&request.method==="POST")return issueJitPermit({env,auth,requestId:permit[1]});
  const execute=path.match(/^\/api\/agentic\/task-execution\/requests\/([^/]+)\/execute$/);
  if(execute&&request.method==="POST"){
    let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
    return executeTask({env,auth,requestId:execute[1],permitId:body?.permitId});
  }
  if(path==="/api/agentic/task-execution/tasks"&&request.method==="GET")return listTasks(env,auth);
  return json({error:"not_found"},404);
}

export const __agenticTaskExecutionTest=Object.freeze({
  normalizeTaskPayload,
  canonicalIntentPayload,
  executionMode,
  platformAdminEmails,
  sessionExecutionEnabled,
  globalExecutionEnabled,
  runtimeKillSwitch
});
