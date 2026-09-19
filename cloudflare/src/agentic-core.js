import {associationForProposal,buildOutcomeAssociations,rankOutcomeInformedProposals} from "./agentic-learning.js";
import {buildSingleAgentOrchestration,verifyOrchestratedProposals} from "./agent-orchestration.js";

const MAX_BODY_BYTES=8192;
const MAX_PROPOSALS=8;
const HIGH_RISK_TERMS=/\b(payment|payroll|salary|terminate|dismiss|fire|file|filing|submit|sign|signature|transfer|refund|debit|credit|journal|tax return|burs|cipa)\b/i;
const CONTROLLED_ACTION_TERMS=/\b(send|notify|remind|schedule|draft|prepare|request|follow up|follow-up)\b/i;
const PROHIBITED_AUTONOMY=Object.freeze([
  "payments_and_transfers",
  "payroll_and_salary_changes",
  "tax_or_regulatory_filing",
  "contract_or_signature_commitment",
  "employee_discipline_or_termination",
  "accounting_journal_posting",
  "refunds_or_customer_debits"
]);
const text=(value,max=500)=>String(value??"").trim().slice(0,max);
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
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

async function authenticate(request,env){
  const raw=cookie(request,"__Host-bw_session")||cookie(request,"bw_session");
  const secret=String(env?.SESSION_SECRET||"");
  if(!raw||!secret||!env?.DB)return null;
  const tokenHash=await hmacHex(secret,raw);
  const row=await env.DB.prepare(`SELECT s.user_id,s.tenant_id,s.csrf_token,m.role,u.email
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.status='active'
    WHERE s.token_hash=? AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP
    LIMIT 1`).bind(tokenHash).first();
  return row||null;
}

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

function roleAllowed(auth,...roles){return roles.includes(String(auth?.role||"").toLowerCase())}

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

function requestBodyErrorStatus(error){
  if(error?.message==="request_too_large")return 413;
  if(error?.message==="unsupported_content_encoding")return 415;
  return 400;
}
async function safeFirst(env,sql,bindings=[]){
  try{return await env.DB.prepare(sql).bind(...bindings).first()}catch{return null}
}

async function observeWorkspace(env,tenantId){
  const [finance,reconciliation,workflows,ops]=await Promise.all([
    safeFirst(env,`SELECT COALESCE(SUM(a.opening_balance_minor+COALESCE(t.net,0)),0) cash_position_minor,
      COUNT(a.id) account_count
      FROM finance_accounts a
      LEFT JOIN (SELECT account_id,SUM(amount_minor) net FROM finance_transactions WHERE tenant_id=? GROUP BY account_id) t ON t.account_id=a.id
      WHERE a.tenant_id=? AND a.status='active'`,[tenantId,tenantId]),
    safeFirst(env,`SELECT COUNT(*) unresolved_count,COALESCE(SUM(ABS(difference_minor)),0) exposure_minor,
      MAX(created_at) latest_reconciliation_at
      FROM finance_reconciliation_runs WHERE tenant_id=? AND status='exception'`,[tenantId]),
    safeFirst(env,`SELECT
      SUM(CASE WHEN status IN ('queued','pending','retry') THEN 1 ELSE 0 END) pending_count,
      SUM(CASE WHEN status IN ('failed','dead') THEN 1 ELSE 0 END) failed_count,
      MIN(CASE WHEN status IN ('queued','pending','retry') THEN due_at END) next_due_at
      FROM workflow_jobs WHERE tenant_id=?`,[tenantId]),
    safeFirst(env,`SELECT summary_date,generation_mode,metrics_json,narrative_json
      FROM daily_operations_summaries WHERE tenant_id=? ORDER BY summary_date DESC,created_at DESC LIMIT 1`,[tenantId])
  ]);
  let opsMetrics={};
  try{opsMetrics=JSON.parse(String(ops?.metrics_json||"{}"))}catch{}
  const [performance,compliance]=await Promise.all([
    safeFirst(env,`SELECT COUNT(*) open_count,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) critical_count,
      SUM(CASE WHEN severity='warning' THEN 1 ELSE 0 END) warning_count,
      MAX(created_at) latest_signal_at
      FROM performance_insights WHERE tenant_id=? AND status IN ('open','acknowledged')`,[tenantId]),
    safeFirst(env,`SELECT
      SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END) overdue_count,
      SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP AND due_at<datetime('now','+14 days') THEN 1 ELSE 0 END) due_14d_count,
      MIN(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP THEN due_at END) next_due_at
      FROM compliance_obligations WHERE tenant_id=?`,[tenantId])
  ]);
  return {
    observedAt:new Date().toISOString(),
    finance:{
      currency:"BWP",
      cashPositionMinor:Number(finance?.cash_position_minor||0),
      accountCount:Number(finance?.account_count||0),
      reconciliationExceptions:Number(reconciliation?.unresolved_count||0),
      reconciliationExposureMinor:Number(reconciliation?.exposure_minor||0),
      latestReconciliationAt:reconciliation?.latest_reconciliation_at||null
    },
    operations:{
      pendingWorkflowCount:Number(workflows?.pending_count||0),
      failedWorkflowCount:Number(workflows?.failed_count||0),
      nextWorkflowDueAt:workflows?.next_due_at||null,
      latestSummaryDate:ops?.summary_date||null,
      latestSummaryMode:ops?.generation_mode||null,
      latestCoverage:Number(opsMetrics?.coverage||0)||null
    },
    performance:{
      openSignals:Number(performance?.open_count||0),
      criticalSignals:Number(performance?.critical_count||0),
      warningSignals:Number(performance?.warning_count||0),
      latestSignalAt:performance?.latest_signal_at||null
    },
    compliance:{
      overdueCount:Number(compliance?.overdue_count||0),
      dueWithin14Days:Number(compliance?.due_14d_count||0),
      nextDueAt:compliance?.next_due_at||null
    }
  };
}

function deterministicSimulation(observation){
  const cash=Number(observation?.finance?.cashPositionMinor||0);
  const reconciliationExposure=Math.max(0,Number(observation?.finance?.reconciliationExposureMinor||0));
  const pending=Math.max(0,Number(observation?.operations?.pendingWorkflowCount||0));
  const failed=Math.max(0,Number(observation?.operations?.failedWorkflowCount||0));
  const overdue=Math.max(0,Number(observation?.compliance?.overdueCount||0));
  const critical=Math.max(0,Number(observation?.performance?.criticalSignals||0));
  return {
    type:"deterministic_non_mutating",
    currency:"BWP",
    cashStress:{recordedCashMinor:cash,reconciliationExposureMinor:reconciliationExposure,exposureAdjustedCashMinor:cash-reconciliationExposure},
    operatingLoad:{pendingWorkflowCount:pending,failedWorkflowCount:failed,overdueComplianceCount:overdue,criticalPerformanceSignals:critical},
    pressureScore:Math.min(100,failed*20+overdue*15+critical*15+Math.min(pending,20)*2),
    assumptions:[
      "Reconciliation exposure is treated as downside uncertainty, not a forecasted loss.",
      "Pressure score is a deterministic triage aid and not a financial, legal or employment decision.",
      "No simulation output changes business records or authorizes execution."
    ]
  };
}

function deterministicFallback(observation){
  const actions=[];
  if(observation.finance.reconciliationExceptions>0){
    actions.push({title:"Review reconciliation exceptions",reason:`${observation.finance.reconciliationExceptions} reconciliation exception(s) remain unresolved.`,priority:"high",sourceRefs:["finance_reconciliation"]});
  }
  if(observation.operations.failedWorkflowCount>0){
    actions.push({title:"Review failed workflows",reason:`${observation.operations.failedWorkflowCount} workflow job(s) are in a failed state.`,priority:"high",sourceRefs:["workflow_jobs"]});
  }
  if(!observation.finance.latestReconciliationAt){
    actions.push({title:"Run the first finance reconciliation",reason:"No reconciliation snapshot is available yet, so finance certainty is limited.",priority:"medium",sourceRefs:["finance_reconciliation"]});
  }
  if(Number(observation?.compliance?.overdueCount||0)>0){
    actions.push({title:"Review overdue compliance obligations",reason:`${observation.compliance.overdueCount} compliance obligation(s) are overdue and require human review.`,priority:"high",sourceRefs:["compliance_obligations"]});
  }
  if(Number(observation?.performance?.criticalSignals||0)>0){
    actions.push({title:"Review critical performance signals",reason:`${observation.performance.criticalSignals} critical operating signal(s) are open. Check source reports before acting.`,priority:"high",sourceRefs:["performance_insights"]});
  }
  if(!actions.length){
    actions.push({title:"Review the current owner brief",reason:"No deterministic exception crossed the Stage 1 agent threshold. Review the latest operating signals before choosing the next action.",priority:"low",sourceRefs:["workspace_observation"]});
  }
  return {answer:"Thebe generated a governed plan from current workspace signals. No autonomous business mutation was performed.",confidence:"medium",actions,caveats:["Human approval is required before any consequential action."],sourceRefs:actions.flatMap(x=>x.sourceRefs||[])};
}

async function runAdvisor({request,env,ctx,coreFetch,runId,observation,orchestration}){
  const question=text(`Create the safest next-action plan from this observation and bounded capability work plan. Treat the numbers as application-calculated facts. Every recommendation must stay within the listed capability work units and cite one or more allowed sourceRefs. Do not instruct autonomous payment, payroll, filing, signing, journal posting, refund, discipline or termination. CAPABILITY_WORK_UNITS ${JSON.stringify(orchestration?.workUnits||[])} ALLOWED_SOURCE_REFS ${JSON.stringify(orchestration?.allowedSourceRefs||[])} OBSERVATION ${JSON.stringify(observation)}`,2400);
  const target=new URL("/api/ai/advisor",request.url);
  const headers=new Headers({"content-type":"application/json","accept":"application/json","idempotency-key":`agentic-plan-${runId}`});
  const cookieHeader=request.headers.get("cookie");if(cookieHeader)headers.set("cookie",cookieHeader);
  const csrf=request.headers.get("x-csrf-token");if(csrf)headers.set("x-csrf-token",csrf);
  const origin=request.headers.get("origin");if(origin)headers.set("origin",origin);
  try{
    const response=await coreFetch(new Request(target.toString(),{method:"POST",headers,body:JSON.stringify({mode:"next_actions",question})}),env,ctx);
    if(!response.ok)return {result:deterministicFallback(observation),generationMode:"deterministic_fallback",advisorStatus:response.status};
    const data=await response.json();
    const result=data?.result||data;
    if(!result||typeof result!=="object")return {result:deterministicFallback(observation),generationMode:"deterministic_fallback",advisorStatus:200};
    return {result,generationMode:"governed_ai_advisor",advisorStatus:200};
  }catch{
    return {result:deterministicFallback(observation),generationMode:"deterministic_fallback",advisorStatus:0};
  }
}

function classifyProposal(action){
  const combined=`${action?.title||""} ${action?.reason||""}`;
  if(HIGH_RISK_TERMS.test(combined))return {risk:"high",authority:"human_only",executionPolicy:"prohibited_autonomy"};
  if(CONTROLLED_ACTION_TERMS.test(combined))return {risk:"medium",authority:"approval_required",executionPolicy:"not_executable_stage_1"};
  return {risk:"low",authority:"recommendation_only",executionPolicy:"not_executable_stage_1"};
}

function normalizeProposals(actions=[]){
  return (Array.isArray(actions)?actions:[]).slice(0,MAX_PROPOSALS).map((action,index)=>{
    const policy=classifyProposal(action);
    return {
      ordinal:index+1,
      title:text(action?.title||"Review recommended action",180),
      reason:text(action?.reason||"Generated from current workspace signals.",700),
      priority:["low","medium","high"].includes(String(action?.priority))?String(action.priority):"medium",
      sourceRefs:Array.isArray(action?.sourceRefs)?action.sourceRefs.map(x=>text(x,120)).filter(Boolean).slice(0,12):[],
      ...policy
    };
  });
}

async function loadOutcomeAssociations(env,tenantId){
  try{
    const rows=await env.DB.prepare(`SELECT refs.source_ref source_ref,
      COUNT(*) evidence_count,
      SUM(CASE WHEN o.outcome_status IN ('improved','resolved') THEN 1 ELSE 0 END) positive_count,
      SUM(CASE WHEN o.outcome_status='worsened' THEN 1 ELSE 0 END) negative_count,
      SUM(CASE WHEN o.outcome_status='unchanged' THEN 1 ELSE 0 END) unchanged_count
      FROM agentic_outcomes o
      JOIN (
        SELECT DISTINCT p0.id proposal_id,p0.tenant_id,ref.value source_ref
        FROM agentic_proposals p0
        JOIN json_each(p0.source_refs_json) ref
        WHERE p0.tenant_id=?
      ) refs ON refs.proposal_id=o.proposal_id AND refs.tenant_id=o.tenant_id
      WHERE o.tenant_id=?
        AND o.outcome_status IN ('improved','resolved','worsened','unchanged')
        AND o.created_at>=datetime('now','-180 days')
        AND o.id=(SELECT o2.id FROM agentic_outcomes o2
          WHERE o2.tenant_id=o.tenant_id AND o2.proposal_id=o.proposal_id
          ORDER BY o2.created_at DESC,o2.id DESC LIMIT 1)
      GROUP BY refs.source_ref
      ORDER BY evidence_count DESC,source_ref ASC
      LIMIT 64`).bind(tenantId,tenantId).all();
    return buildOutcomeAssociations(rows.results||[]);
  }catch{return {}}
}

async function appendEvent(env,{tenantId,runId,proposalId=null,eventType,actorUserId,detail={}}){
  await env.DB.prepare(`INSERT INTO agentic_events(id,tenant_id,run_id,proposal_id,event_type,actor_user_id,detail_json)
    VALUES(?,?,?,?,?,?,?)`).bind(id(),tenantId,runId,proposalId,eventType,actorUserId,JSON.stringify(detail)).run();
}

async function createPlan({request,env,ctx,coreFetch,auth}){
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const goal=text(body?.goal||"Protect the business and identify the safest next actions.",500);
  const runId=id(),observation=await observeWorkspace(env,auth.tenant_id);
  observation.simulation=deterministicSimulation(observation);
  const orchestration=buildSingleAgentOrchestration({goal,observation});
  observation.orchestration=orchestration;
  const advisor=await runAdvisor({request,env,ctx,coreFetch,runId,observation,orchestration});
  const normalizedProposals=normalizeProposals(advisor.result?.actions);
  const verified=verifyOrchestratedProposals(normalizedProposals,orchestration);
  const outcomeAssociations=await loadOutcomeAssociations(env,auth.tenant_id);
  const proposals=rankOutcomeInformedProposals(verified.proposals,outcomeAssociations);
  observation.verification=verified.summary;
  observation.learning={
    type:"non_causal_outcome_association",
    causal:false,
    evidenceWindowDays:180,
    minimumEvidencePerSource:3,
    sourceCount:Object.keys(outcomeAssociations).length,
    authorityEffect:"none",
    executionEffect:"none"
  };
  const summary=text(advisor.result?.answer||"Governed plan generated.",3000);
  const confidence=["low","medium","high"].includes(String(advisor.result?.confidence))?String(advisor.result.confidence):"medium";
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO agentic_runs(id,tenant_id,requested_by_user_id,goal,status,generation_mode,confidence,observation_json,summary)
      VALUES(?,?,?,?, 'completed',?,?,?,?)`).bind(runId,auth.tenant_id,auth.user_id,goal,advisor.generationMode,confidence,JSON.stringify(observation),summary),
    ...proposals.map(item=>env.DB.prepare(`INSERT INTO agentic_proposals(id,tenant_id,run_id,ordinal,title,reason,priority,risk,authority,execution_policy,source_refs_json,status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending')`).bind(id(),auth.tenant_id,runId,item.ordinal,item.title,item.reason,item.priority,item.risk,item.authority,item.executionPolicy,JSON.stringify(item.sourceRefs)))
  ]);
  await appendEvent(env,{tenantId:auth.tenant_id,runId,eventType:"PLAN_GENERATED",actorUserId:auth.user_id,detail:{goal,generationMode:advisor.generationMode,proposalCount:proposals.length,outcomeInformedRanking:true,learningSourceCount:Object.keys(outcomeAssociations).length,orchestrationVersion:orchestration.version,workUnitCount:orchestration.workUnits.length,allProposalsGrounded:verified.summary.allGrounded,authorityEffect:"none"}});
  const saved=await env.DB.prepare(`SELECT id,ordinal,title,reason,priority,risk,authority,execution_policy,source_refs_json,status,created_at
    FROM agentic_proposals WHERE tenant_id=? AND run_id=? ORDER BY ordinal`).bind(auth.tenant_id,runId).all();
  return json({
    ok:true,
    stage:"observe_decompose_route_reason_verify_recommend",
    run:{id:runId,goal,status:"completed",generationMode:advisor.generationMode,confidence,summary,observation},
    proposals:(saved.results||[]).map(row=>{
      const proposal={...row,sourceRefs:JSON.parse(row.source_refs_json||"[]"),source_refs_json:undefined};
      return {...proposal,outcomeLearning:associationForProposal(proposal,outcomeAssociations)};
    }),
    architecture:{agentKey:"thebe",singleAgent:true,orchestrationVersion:orchestration.version,fanOut:orchestration.fanOut,session:orchestration.session},
    authority:{executionEnabled:false,humanApprovalRequired:true,prohibitedAutonomy:PROHIBITED_AUTONOMY}
  },201);
}

async function listRuns(env,auth){
  const runs=await env.DB.prepare(`SELECT id,goal,status,generation_mode,confidence,summary,created_at
    FROM agentic_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20`).bind(auth.tenant_id).all();
  const proposals=await env.DB.prepare(`SELECT id,run_id,ordinal,title,priority,risk,authority,execution_policy,status,decision_at,created_at
    FROM agentic_proposals WHERE tenant_id=? ORDER BY created_at DESC,ordinal LIMIT 100`).bind(auth.tenant_id).all();
  return json({items:runs.results||[],proposals:proposals.results||[],authority:{executionEnabled:false,prohibitedAutonomy:PROHIBITED_AUTONOMY}});
}

async function decideProposal({env,auth,proposalId,decision}){
  const proposal=await env.DB.prepare(`SELECT id,run_id,status FROM agentic_proposals WHERE id=? AND tenant_id=? LIMIT 1`).bind(proposalId,auth.tenant_id).first();
  if(!proposal)return json({error:"agentic_proposal_not_found"},404);
  if(proposal.status!=="pending")return json({error:"agentic_proposal_already_decided",status:proposal.status},409);
  if(decision==="approved"&&!roleAllowed(auth,"owner"))return json({error:"owner_approval_required"},403);
  if(decision==="rejected"&&!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  const eventType=decision==="approved"?"PROPOSAL_APPROVED":"PROPOSAL_REJECTED";
  const results=await env.DB.batch([
    env.DB.prepare(`UPDATE agentic_proposals SET status=?,decided_by_user_id=?,decision_at=CURRENT_TIMESTAMP
      WHERE id=? AND tenant_id=? AND status='pending'`).bind(decision,auth.user_id,proposalId,auth.tenant_id),
    env.DB.prepare(`INSERT INTO agentic_events(id,tenant_id,run_id,proposal_id,event_type,actor_user_id,detail_json)
      SELECT ?,?,?,?,?,?,? WHERE changes()=1`).bind(id(),auth.tenant_id,proposal.run_id,proposalId,eventType,auth.user_id,JSON.stringify({executionEnabled:false}))
  ]);
  const changed=Number(results?.[0]?.meta?.changes??results?.[0]?.changes??0);
  if(changed!==1){
    const current=await env.DB.prepare(`SELECT status FROM agentic_proposals WHERE id=? AND tenant_id=? LIMIT 1`).bind(proposalId,auth.tenant_id).first();
    if(!current)return json({error:"agentic_proposal_not_found"},404);
    return json({error:"agentic_proposal_already_decided",status:current.status},409);
  }
  return json({ok:true,id:proposalId,status:decision,execution:{performed:false,enabled:false,reason:"Stage 1 records governance decisions only."}});
}

async function listOutcomes(env,auth){
  const rows=await env.DB.prepare(`SELECT o.id,o.run_id,o.proposal_id,o.outcome_status,o.metric_key,o.baseline_json,o.observed_json,o.note,o.created_at,
    p.title proposal_title,p.status proposal_status
    FROM agentic_outcomes o JOIN agentic_proposals p ON p.id=o.proposal_id AND p.tenant_id=o.tenant_id
    WHERE o.tenant_id=? ORDER BY o.created_at DESC LIMIT 100`).bind(auth.tenant_id).all();
  return json({items:(rows.results||[]).map(row=>({...row,baseline:JSON.parse(row.baseline_json||"{}"),observed:JSON.parse(row.observed_json||"{}"),baseline_json:undefined,observed_json:undefined})),executionEnabled:false});
}

async function recordOutcome({request,env,auth,proposalId}){
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  const proposal=await env.DB.prepare(`SELECT id,run_id,status FROM agentic_proposals WHERE id=? AND tenant_id=? LIMIT 1`).bind(proposalId,auth.tenant_id).first();
  if(!proposal)return json({error:"agentic_proposal_not_found"},404);
  if(proposal.status==="pending")return json({error:"proposal_decision_required_before_outcome"},409);
  let body;try{body=await readJson(request)}catch(error){return json({error:error.message},requestBodyErrorStatus(error))}
  const outcomeStatus=String(body?.outcomeStatus||"");
  const allowed=new Set(["observed","improved","unchanged","worsened","resolved","not_applicable"]);
  if(!allowed.has(outcomeStatus))return json({error:"invalid_outcome_status"},400);
  const metricKey=text(body?.metricKey||"",120)||null;
  const note=text(body?.note||"",1000);
  const baseline=body?.baseline&&typeof body.baseline==="object"&&!Array.isArray(body.baseline)?body.baseline:{};
  const observed=body?.observed&&typeof body.observed==="object"&&!Array.isArray(body.observed)?body.observed:{};
  const outcomeId=id();
  await env.DB.prepare(`INSERT INTO agentic_outcomes(id,tenant_id,run_id,proposal_id,recorded_by_user_id,outcome_status,metric_key,baseline_json,observed_json,note)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(outcomeId,auth.tenant_id,proposal.run_id,proposalId,auth.user_id,outcomeStatus,metricKey,JSON.stringify(baseline),JSON.stringify(observed),note).run();
  return json({ok:true,id:outcomeId,proposalId,runId:proposal.run_id,outcomeStatus,measurementOnly:true,execution:{performed:false,enabled:false}},201);
}

export async function handleAgenticRequest({request,logicalPath,env,ctx,coreFetch}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic"))return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager","reviewer"))return json({error:"forbidden"},403);
  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }
  if(path==="/api/agentic/status"&&request.method==="GET")return json({
    enabled:true,
    stage:"observe_reason_simulate_recommend_measure",
    executionEnabled:false,
    approvalRecordsEnabled:true,
    outcomeLearning:{enabled:true,type:"non_causal_association",minimumEvidencePerSource:3,priorityClassOverride:false,riskAuthorityEffect:false,executionAuthorityEffect:false},
    prohibitedAutonomy:PROHIBITED_AUTONOMY,
    principles:["grounded_workspace_observation","least_authority","human_approval","no_hidden_execution","auditable_decisions"]
  });
  if(path==="/api/agentic/runs"&&request.method==="GET")return listRuns(env,auth);
  if(path==="/api/agentic/outcomes"&&request.method==="GET")return listOutcomes(env,auth);
  if(path==="/api/agentic/plan"&&request.method==="POST")return createPlan({request,env,ctx,coreFetch,auth});
  const outcomeMatch=path.match(/^\/api\/agentic\/proposals\/([^/]+)\/outcome$/);
  if(outcomeMatch&&request.method==="POST")return recordOutcome({request,env,auth,proposalId:outcomeMatch[1]});
  const decisionMatch=path.match(/^\/api\/agentic\/proposals\/([^/]+)\/(approve|reject)$/);
  if(decisionMatch&&request.method==="POST")return decideProposal({env,auth,proposalId:decisionMatch[1],decision:decisionMatch[2]==="approve"?"approved":"rejected"});
  return json({error:"not_found"},404);
}

export const __agenticFoundationTest=Object.freeze({
  classifyProposal,
  normalizeProposals,
  deterministicSimulation,
  originAllowed,
  csrfAllowed,
  prohibitedAutonomy:PROHIBITED_AUTONOMY
});
