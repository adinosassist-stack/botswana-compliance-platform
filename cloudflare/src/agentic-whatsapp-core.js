import {AGENT_ACTION_CATALOG,THEBE_AGENTS} from "./agent-policy.js";
import {evaluateDelegatedAuthority} from "./delegated-authority.js";

const MAX_BODY_BYTES=4096;
const ACTION_KEY_BY_PURPOSE=Object.freeze({
  owner_daily_brief:Object.freeze({agentKey:"management",actionKey:"management_brief.prepare",label:"Owner daily brief"}),
  finance_exception:Object.freeze({agentKey:"finance",actionKey:"finance_brief.prepare",label:"Finance reconciliation follow-up"}),
  compliance_followup:Object.freeze({agentKey:"compliance",actionKey:"compliance_action_plan.prepare",label:"Compliance follow-up"}),
  operations_update:Object.freeze({agentKey:"operations",actionKey:"daily_operations_brief.prepare",label:"Operations update"})
});
const ALLOWED_BODY_KEYS=new Set(["purpose"]);

const text=(value,max=1200)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const id=()=>crypto.randomUUID();

function cookie(request,name){
  const raw=request.headers.get("cookie")||"";
  for(const part of raw.split(";")){
    const [key,...rest]=part.trim().split("=");
    if(key===name)return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function hmacHex(secret,value){
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,encoder.encode(value));
  return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function authenticate(request,env){
  const raw=cookie(request,"__Host-bw_session")||cookie(request,"bw_session");
  const secret=String(env?.SESSION_SECRET||"");
  if(!raw||!secret||!env?.DB)return null;
  const tokenHash=await hmacHex(secret,raw);
  return await env.DB.prepare(`SELECT s.user_id,s.tenant_id,s.csrf_token,m.role
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.status='active'
    WHERE s.token_hash=? AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP
    LIMIT 1`).bind(tokenHash).first();
}

function roleAllowed(auth,...roles){return roles.includes(String(auth?.role||"").toLowerCase())}
function originAllowed(request,env){
  const origin=text(request.headers.get("origin"),300);
  if(!origin)return true;
  try{
    const expected=new URL(String(env?.PUBLIC_ORIGIN||env?.PUBLIC_APP_URL||""));
    return new URL(origin).origin===expected.origin;
  }catch{return false}
}
function csrfAllowed(request,auth){
  const supplied=String(request.headers.get("x-csrf-token")||"");
  const expected=String(auth?.csrf_token||"");
  return !!supplied&&!!expected&&supplied===expected;
}

async function readJson(request){
  const encoding=String(request.headers.get("content-encoding")||"").trim().toLowerCase();
  if(encoding&&encoding!=="identity")throw new Error("unsupported_content_encoding");
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new Error("request_too_large");
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error("request_too_large");
  if(!raw)return {};
  try{return JSON.parse(raw)}catch{throw new Error("invalid_json")}
}

function gaboroneDate(now=new Date()){
  return new Date(now.getTime()+2*60*60*1000).toISOString().slice(0,10);
}
function pula(minor){
  const n=Number(minor||0);
  return `P${(Number.isFinite(n)?n:0)/100}`.replace(/(\.\d\d)\d+$/,"$1").replace(/\.0+$/,"");
}
function safeJson(value,fallback={}){try{return JSON.parse(String(value||"{}"))}catch{return fallback}}

async function ownerSnapshot(env,tenantId){
  const [finance,reconciliation,compliance,workflows,performance]=await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(a.opening_balance_minor+COALESCE(t.net,0)),0) cash_position_minor,COUNT(a.id) account_count
      FROM finance_accounts a
      LEFT JOIN (SELECT account_id,SUM(amount_minor) net FROM finance_transactions WHERE tenant_id=? GROUP BY account_id) t ON t.account_id=a.id
      WHERE a.tenant_id=? AND a.status='active'`).bind(tenantId,tenantId).first(),
    env.DB.prepare(`SELECT COUNT(*) exception_count,COALESCE(SUM(ABS(difference_minor)),0) exposure_minor,MAX(created_at) latest_reconciliation_at
      FROM finance_reconciliation_runs WHERE tenant_id=? AND status='exception'`).bind(tenantId).first(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END) overdue_count,
      SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP AND due_at<datetime('now','+14 days') THEN 1 ELSE 0 END) due_14d_count
      FROM compliance_obligations WHERE tenant_id=?`).bind(tenantId).first(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status IN ('queued','pending','retry') THEN 1 ELSE 0 END) pending_count,
      SUM(CASE WHEN status IN ('failed','dead') THEN 1 ELSE 0 END) failed_count
      FROM workflow_jobs WHERE tenant_id=?`).bind(tenantId).first(),
    env.DB.prepare(`SELECT COUNT(*) critical_count FROM performance_insights
      WHERE tenant_id=? AND status IN ('open','acknowledged') AND severity='critical'`).bind(tenantId).first()
  ]);
  return {
    kind:"owner_daily_brief",
    observedAt:new Date().toISOString(),
    currency:"BWP",
    cashPositionMinor:Number(finance?.cash_position_minor||0),
    financeAccountCount:Number(finance?.account_count||0),
    reconciliationExceptions:Number(reconciliation?.exception_count||0),
    reconciliationExposureMinor:Number(reconciliation?.exposure_minor||0),
    latestReconciliationAt:reconciliation?.latest_reconciliation_at||null,
    overdueCompliance:Number(compliance?.overdue_count||0),
    complianceDue14d:Number(compliance?.due_14d_count||0),
    pendingWorkflows:Number(workflows?.pending_count||0),
    failedWorkflows:Number(workflows?.failed_count||0),
    criticalPerformanceSignals:Number(performance?.critical_count||0),
    sourceRefs:["finance_accounts","finance_transactions","finance_reconciliation_runs","compliance_obligations","workflow_jobs","performance_insights"]
  };
}

async function financeSnapshot(env,tenantId){
  const row=await env.DB.prepare(`SELECT r.id,a.name account_name,r.statement_to,r.difference_minor,r.created_at
    FROM finance_reconciliation_runs r JOIN finance_accounts a ON a.id=r.account_id AND a.tenant_id=r.tenant_id
    WHERE r.tenant_id=? AND r.status='exception' ORDER BY r.created_at DESC,r.id DESC LIMIT 1`).bind(tenantId).first();
  return {
    kind:"finance_exception",
    observedAt:new Date().toISOString(),
    exception:row?{id:String(row.id),accountName:text(row.account_name,120),statementTo:String(row.statement_to||""),differenceMinor:Number(row.difference_minor||0),createdAt:row.created_at||null}:null,
    sourceRefs:["finance_reconciliation_runs","finance_accounts"]
  };
}

async function complianceSnapshot(env,tenantId){
  const row=await env.DB.prepare(`SELECT
    SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END) overdue_count,
    SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP AND due_at<datetime('now','+14 days') THEN 1 ELSE 0 END) due_14d_count,
    MIN(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP THEN due_at END) next_due_at
    FROM compliance_obligations WHERE tenant_id=?`).bind(tenantId).first();
  return {kind:"compliance_followup",observedAt:new Date().toISOString(),overdueCount:Number(row?.overdue_count||0),due14dCount:Number(row?.due_14d_count||0),nextDueAt:row?.next_due_at||null,sourceRefs:["compliance_obligations"]};
}

async function operationsSnapshot(env,tenantId){
  const [summary,workflow]=await Promise.all([
    env.DB.prepare(`SELECT summary_date,generation_mode,metrics_json FROM daily_operations_summaries
      WHERE tenant_id=? ORDER BY summary_date DESC,created_at DESC LIMIT 1`).bind(tenantId).first(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status IN ('queued','pending','retry') THEN 1 ELSE 0 END) pending_count,
      SUM(CASE WHEN status IN ('failed','dead') THEN 1 ELSE 0 END) failed_count
      FROM workflow_jobs WHERE tenant_id=?`).bind(tenantId).first()
  ]);
  const metrics=safeJson(summary?.metrics_json,{});
  return {
    kind:"operations_update",
    observedAt:new Date().toISOString(),
    latestSummaryDate:summary?.summary_date||null,
    summaryMode:summary?.generation_mode||null,
    reportingCoverage:Number(metrics?.coverage||0),
    pendingWorkflows:Number(workflow?.pending_count||0),
    failedWorkflows:Number(workflow?.failed_count||0),
    sourceRefs:["daily_operations_summaries","workflow_jobs"]
  };
}

async function snapshotForPurpose(env,tenantId,purpose){
  if(purpose==="owner_daily_brief")return ownerSnapshot(env,tenantId);
  if(purpose==="finance_exception")return financeSnapshot(env,tenantId);
  if(purpose==="compliance_followup")return complianceSnapshot(env,tenantId);
  if(purpose==="operations_update")return operationsSnapshot(env,tenantId);
  throw new Error("unsupported_purpose");
}

function buildDraft(purpose,snapshot,{date=gaboroneDate()}={}){
  const footer="Review in Thebe Desk before sending or acting.";
  if(purpose==="owner_daily_brief"){
    return [
      `Thebe Desk owner brief · ${date}`,
      `Recorded cash: ${pula(snapshot.cashPositionMinor)} across ${Number(snapshot.financeAccountCount||0)} account(s).`,
      `Reconciliation: ${Number(snapshot.reconciliationExceptions||0)} exception(s), ${pula(snapshot.reconciliationExposureMinor)} exposure.`,
      `Compliance: ${Number(snapshot.overdueCompliance||0)} overdue, ${Number(snapshot.complianceDue14d||0)} due within 14 days.`,
      `Operations: ${Number(snapshot.pendingWorkflows||0)} pending, ${Number(snapshot.failedWorkflows||0)} failed workflow(s).`,
      `Critical business signals: ${Number(snapshot.criticalPerformanceSignals||0)}.`,
      footer
    ].join("\n");
  }
  if(purpose==="finance_exception"){
    if(!snapshot.exception)return [`Thebe Desk finance check · ${date}`,"No unresolved reconciliation exception is currently recorded.",footer].join("\n");
    return [
      `Thebe Desk finance check · ${date}`,
      `${snapshot.exception.accountName||"Finance account"}: reconciliation difference ${pula(snapshot.exception.differenceMinor)} for period ending ${snapshot.exception.statementTo||"unknown"}.`,
      "Review the source statement and ledger records before correcting anything.",
      footer
    ].join("\n");
  }
  if(purpose==="compliance_followup"){
    return [
      `Thebe Desk compliance follow-up · ${date}`,
      `${Number(snapshot.overdueCount||0)} overdue obligation(s); ${Number(snapshot.due14dCount||0)} due within 14 days.`,
      snapshot.nextDueAt?`Next recorded due date: ${String(snapshot.nextDueAt).slice(0,10)}.`:"No upcoming due date is currently recorded.",
      "Confirm the applicable rule and supporting evidence before filing or submitting anything.",
      footer
    ].join("\n");
  }
  if(purpose==="operations_update"){
    return [
      `Thebe Desk operations update · ${date}`,
      snapshot.latestSummaryDate?`Latest summary: ${snapshot.latestSummaryDate}; reporting coverage ${Number(snapshot.reportingCoverage||0)}%.`:"No daily-operations summary is currently recorded.",
      `Workflows: ${Number(snapshot.pendingWorkflows||0)} pending, ${Number(snapshot.failedWorkflows||0)} failed.`,
      "Use source reports before making any employee or disciplinary decision.",
      footer
    ].join("\n");
  }
  throw new Error("unsupported_purpose");
}

function parseObservation(value){try{return JSON.parse(String(value||"{}"))}catch{return {}}}
function publicIntent(row){return row?{id:String(row.id||""),runId:String(row.run_id||""),agentKey:String(row.agent_key||""),actionKey:String(row.action_key||""),decision:String(row.decision||""),decisionCode:String(row.decision_code||""),status:String(row.status||""),createdAt:row.created_at||null}:null}

async function replayIntent(env,tenantId,idempotencyKey){
  return await env.DB.prepare(`SELECT ai.id,ai.run_id,ai.agent_key,ai.action_key,ai.decision,ai.decision_code,ai.status,ai.payload_hash,ai.created_at,
      r.summary,r.observation_json
    FROM agent_action_intents ai LEFT JOIN agentic_runs r ON r.id=ai.run_id AND r.tenant_id=ai.tenant_id
    WHERE ai.tenant_id=? AND ai.idempotency_key=? LIMIT 1`).bind(tenantId,idempotencyKey).first();
}

async function prepareDraft({request,env,auth}){
  let body;try{body=await readJson(request)}catch(error){
    const status=error.message==="request_too_large"?413:error.message==="unsupported_content_encoding"?415:400;
    return json({error:error.message},status);
  }
  const unexpected=Object.keys(body||{}).find(key=>!ALLOWED_BODY_KEYS.has(key));
  if(unexpected)return json({error:"unsupported_field",field:unexpected},400);
  const purpose=text(body?.purpose,80),spec=ACTION_KEY_BY_PURPOSE[purpose];
  if(!spec)return json({error:"unsupported_whatsapp_prepare_purpose",supported:Object.keys(ACTION_KEY_BY_PURPOSE)},400);
  const agent=THEBE_AGENTS[spec.agentKey],definition=AGENT_ACTION_CATALOG[spec.actionKey];
  if(!agent||!definition||definition.level!==2||definition.humanReviewRequired!==true)return json({error:"whatsapp_prepare_policy_unavailable"},503);
  const role=String(auth.role||"").toLowerCase();
  if(!agent.allowedRoles.includes(role)||!definition.roles.includes(role))return json({error:"role_forbidden"},403);

  const idem=text(request.headers.get("idempotency-key"),200);
  if(idem.length<8)return json({error:"idempotency_key_required"},400);
  const requestHash=await sha256Hex(JSON.stringify({purpose,agentKey:spec.agentKey,actionKey:spec.actionKey}));
  const existing=await replayIntent(env,auth.tenant_id,idem);
  if(existing){
    if(String(existing.action_key)!==spec.actionKey||String(existing.payload_hash)!==requestHash)return json({error:"idempotency_key_conflict"},409);
    return json({ok:true,replayed:true,purpose,intent:publicIntent(existing),messagePreview:String(existing.summary||""),snapshot:parseObservation(existing.observation_json),policy:{humanReviewRequired:true,prepareOnly:true},execution:{performed:false,enabled:false,providerSend:false,recipientTargeting:false}},200);
  }

  let snapshot;try{snapshot=await snapshotForPurpose(env,auth.tenant_id,purpose)}catch{return json({error:"whatsapp_prepare_data_unavailable"},503)}
  const messagePreview=buildDraft(purpose,snapshot);
  const decision=evaluateDelegatedAuthority({agentKey:spec.agentKey,actionKey:spec.actionKey,actionDefinition:definition,delegation:null,mode:"shadow",globalExecutionEnabled:false});
  if(decision.allowed!==true||decision.executionAllowed!==false)return json({error:"whatsapp_prepare_policy_denied",decision},409);

  const runId=id(),intentId=id();
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO agentic_runs(id,tenant_id,requested_by_user_id,goal,status,generation_mode,confidence,observation_json,summary)
        VALUES(?,?,?,?, 'completed','deterministic_fallback','medium',?,?)`).bind(runId,auth.tenant_id,auth.user_id,`Prepare ${spec.label} for WhatsApp human review.`,JSON.stringify(snapshot),messagePreview),
      env.DB.prepare(`INSERT INTO agent_action_intents(id,tenant_id,run_id,proposal_id,agent_key,action_key,requested_by_user_id,delegation_id,mode,decision,decision_code,
        required_autonomy_level,amount_minor,payload_hash,idempotency_key,status)
        VALUES(?,?,?,NULL,?,?,?,NULL,'shadow',?,?,?,0,?,?,'review_required')`).bind(intentId,auth.tenant_id,runId,spec.agentKey,spec.actionKey,auth.user_id,decision.decision,decision.code,decision.requiredAutonomyLevel,requestHash,idem),
      env.DB.prepare(`INSERT INTO agentic_events(id,tenant_id,run_id,proposal_id,event_type,actor_user_id,detail_json)
        VALUES(?,?,?,NULL,'PLAN_GENERATED',?,?)`).bind(id(),auth.tenant_id,runId,auth.user_id,JSON.stringify({channel:"whatsapp",purpose,actionKey:spec.actionKey,prepareOnly:true,providerSend:false,recipientTargeting:false}))
    ]);
  }catch{
    const replay=await replayIntent(env,auth.tenant_id,idem);
    if(replay&&String(replay.action_key)===spec.actionKey&&String(replay.payload_hash)===requestHash){
      return json({ok:true,replayed:true,purpose,intent:publicIntent(replay),messagePreview:String(replay.summary||""),snapshot:parseObservation(replay.observation_json),policy:{humanReviewRequired:true,prepareOnly:true},execution:{performed:false,enabled:false,providerSend:false,recipientTargeting:false}},200);
    }
    return json({error:"whatsapp_prepare_failed"},500);
  }

  return json({
    ok:true,replayed:false,purpose,
    intent:{id:intentId,runId,agentKey:spec.agentKey,actionKey:spec.actionKey,decision:decision.decision,decisionCode:decision.code,status:"review_required"},
    messagePreview,snapshot,
    policy:{humanReviewRequired:true,prepareOnly:true,sourceRefs:snapshot.sourceRefs||[]},
    execution:{performed:false,enabled:false,providerSend:false,recipientTargeting:false}
  },201);
}

export async function handleAgenticWhatsAppRequest({request,logicalPath,env}){
  if(!String(logicalPath||"").startsWith("/api/agentic/whatsapp"))return null;
  const auth=await authenticate(request,env);if(!auth)return json({error:"authentication_required"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(logicalPath==="/api/agentic/whatsapp/status"&&request.method==="GET"){
    return json({enabled:true,mode:"prepare_only",purposes:Object.entries(ACTION_KEY_BY_PURPOSE).map(([key,value])=>({key,label:value.label,agentKey:value.agentKey,actionKey:value.actionKey})),humanReviewRequired:true,providerSend:false,recipientTargeting:false,executionEnabled:false});
  }
  if(logicalPath==="/api/agentic/whatsapp/prepare"&&request.method==="POST"){
    if(!originAllowed(request,env))return json({error:"origin_forbidden"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_required"},403);
    return prepareDraft({request,env,auth});
  }
  return json({error:"not_found"},404);
}

export const __whatsappAgenticTest=Object.freeze({ACTION_KEY_BY_PURPOSE,buildDraft,gaboroneDate,pula});
