import {financeSummary} from "./finance-core.js";
import {financeReceivablesSummary,financeDailyCollections} from "./finance-receivables.js";

export const BUSINESS_CONTEXT_VERSION="2026-09-26.v1";

const PROFILE_KEYS=Object.freeze({
  monthlyRevenueTargetBwp:"decisionMonthlyRevenueTargetBwp",
  currentCashBwp:"decisionCurrentCashBwp",
  minimumCashBufferBwp:"decisionMinimumCashBufferBwp",
  monthlyCashOutflowsBwp:"decisionMonthlyCashOutflowsBwp",
  monthlyLabourCostBwp:"decisionMonthlyLabourCostBwp",
  plannedPurchaseBwp:"decisionPlannedPurchaseBwp",
  operatingDaysPerMonth:"decisionOperatingDaysPerMonth",
  plannedPurchaseLabel:"decisionPlannedPurchaseLabel",
  sameMonthCollectionPct:"decisionSameMonthCollectionPct"
});
const frozen=value=>Object.freeze(value);
const clean=(value,max=240)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
const safeJson=(value,fallback={})=>{try{const parsed=JSON.parse(String(value||""));return parsed&&typeof parsed==="object"?parsed:fallback}catch{return fallback}};
const gaboroneDate=(now=new Date())=>{try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(now)}catch{return now.toISOString().slice(0,10)}};
const pulaMinor=value=>`P${(Number(value||0)/100).toLocaleString("en-BW",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
async function safeFirst(env,sql,bindings=[]){try{return await env.DB.prepare(sql).bind(...bindings).first()}catch{return null}}

function activeCompany(state){
  const companies=Array.isArray(state?.companies)?state.companies:[];
  const activeId=String(state?.activeCompanyId||"");
  return companies.find(item=>String(item?.id||"")===activeId)||companies[0]||null;
}

function ownerEnteredMemory(state,tenantName){
  const company=activeCompany(state);
  const profile=company?.profile&&typeof company.profile==="object"
    ?company.profile
    :(state?.profile&&typeof state.profile==="object"?state.profile:{});
  const value=key=>finite(profile?.[PROFILE_KEYS[key]]);
  const locations=Array.isArray(company?.locations)
    ?company.locations.slice(0,25).map(item=>clean(item?.name||item?.label||item,80)).filter(Boolean)
    :[];
  return frozen({
    source:"owner_workspace_profile",
    authoritative:false,
    tenantName:clean(tenantName,160)||null,
    activeCompanyId:clean(company?.id,120)||null,
    activeCompanyName:clean(company?.name||profile?.companyName||tenantName,160)||null,
    industry:clean(profile?.industry||profile?.businessType,120)||null,
    locations:frozen(locations),
    assumptions:frozen({
      monthlyRevenueTargetBwp:value("monthlyRevenueTargetBwp"),
      currentCashBwp:value("currentCashBwp"),
      minimumCashBufferBwp:value("minimumCashBufferBwp"),
      monthlyCashOutflowsBwp:value("monthlyCashOutflowsBwp"),
      monthlyLabourCostBwp:value("monthlyLabourCostBwp"),
      plannedPurchaseBwp:value("plannedPurchaseBwp"),
      operatingDaysPerMonth:value("operatingDaysPerMonth"),
      sameMonthCollectionPct:value("sameMonthCollectionPct"),
      plannedPurchaseLabel:clean(profile?.[PROFILE_KEYS.plannedPurchaseLabel],80)||null
    })
  });
}

function salesMemory(state,{businessDate=gaboroneDate()}={}){
  const company=activeCompany(state),sales=company?.salesIntelligence&&typeof company.salesIntelligence==="object"?company.salesIntelligence:{};
  const opportunities=Array.isArray(sales.opportunities)?sales.opportunities.slice(0,500):[];
  const settings=sales.settings&&typeof sales.settings==="object"?sales.settings:{};
  const dormantDays=Math.min(90,Math.max(3,Math.round(Number(settings.dormantDays)||10)));
  const today=Date.parse(`${businessDate}T00:00:00Z`);
  let openCount=0,openValueBwp=0,dormantCount=0,dormantValueBwp=0;
  for(const row of opportunities){
    if(String(row?.status||"open")!=="open")continue;
    const value=Math.max(0,Number(row?.quoteValueBwp||0));
    openCount++;openValueBwp+=value;
    const last=String(row?.lastContactAt||row?.quotedAt||row?.createdAt||"").slice(0,10),lastMs=Date.parse(`${last}T00:00:00Z`);
    if(Number.isFinite(today)&&Number.isFinite(lastMs)&&Math.floor((today-lastMs)/86400000)>=dormantDays){dormantCount++;dormantValueBwp+=value}
  }
  return frozen({
    source:"owner_workspace_sales",
    authoritative:false,
    openQuotationCount:openCount,
    openQuotationValueBwp:Math.round(openValueBwp*100)/100,
    dormantQuotationCount:dormantCount,
    dormantQuotationValueBwp:Math.round(dormantValueBwp*100)/100,
    dormantDays
  });
}

async function operationsContext(env,tenantId,{allowed=true}={}){
  if(!allowed)return frozen({restricted:true});
  const [workflow,ops,performance]=await Promise.all([
    safeFirst(env,`SELECT
      SUM(CASE WHEN status IN ('queued','pending','retry') THEN 1 ELSE 0 END) pending_count,
      SUM(CASE WHEN status IN ('failed','dead') THEN 1 ELSE 0 END) failed_count,
      MIN(CASE WHEN status IN ('queued','pending','retry') THEN due_at END) next_due_at
      FROM workflow_jobs WHERE tenant_id=?`,[tenantId]),
    safeFirst(env,`SELECT summary_date,generation_mode,metrics_json FROM daily_operations_summaries
      WHERE tenant_id=? ORDER BY summary_date DESC,created_at DESC LIMIT 1`,[tenantId]),
    safeFirst(env,`SELECT COUNT(*) open_count,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) critical_count,
      SUM(CASE WHEN severity='warning' THEN 1 ELSE 0 END) warning_count,
      MAX(created_at) latest_signal_at
      FROM performance_insights WHERE tenant_id=? AND status IN ('open','acknowledged')`,[tenantId])
  ]);
  const metrics=safeJson(ops?.metrics_json,{});
  return frozen({
    pendingWorkflowCount:Number(workflow?.pending_count||0),
    failedWorkflowCount:Number(workflow?.failed_count||0),
    nextWorkflowDueAt:workflow?.next_due_at||null,
    latestSummaryDate:ops?.summary_date||null,
    latestSummaryMode:ops?.generation_mode||null,
    latestCoverage:finite(metrics?.coverage),
    openPerformanceSignals:Number(performance?.open_count||0),
    criticalPerformanceSignals:Number(performance?.critical_count||0),
    warningPerformanceSignals:Number(performance?.warning_count||0),
    latestPerformanceSignalAt:performance?.latest_signal_at||null
  });
}

async function complianceContext(env,tenantId){
  const row=await safeFirst(env,`SELECT
    SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END) overdue_count,
    SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP AND due_at<datetime('now','+14 days') THEN 1 ELSE 0 END) due_14d_count,
    MIN(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP THEN due_at END) next_due_at
    FROM compliance_obligations WHERE tenant_id=?`,[tenantId]);
  return frozen({
    overdueCount:Number(row?.overdue_count||0),
    dueWithin14Days:Number(row?.due_14d_count||0),
    nextDueAt:row?.next_due_at||null
  });
}

export async function buildBusinessContext(env,tenantId,{actorRole="owner",now=new Date()}={}){
  const role=String(actorRole||"").toLowerCase(),businessDate=gaboroneDate(now);
  const management=role==="owner"||role==="manager";
  const [finance,receivables,collections,operations,compliance,tenant,stateRow]=await Promise.all([
    financeSummary(env,tenantId),
    financeReceivablesSummary(env,tenantId,{businessDate,customerLimit:management?5:1,invoiceLimit:management?5:1}),
    financeDailyCollections(env,tenantId,{businessDate}),
    operationsContext(env,tenantId,{allowed:management}),
    complianceContext(env,tenantId),
    safeFirst(env,"SELECT name FROM tenants WHERE id=? LIMIT 1",[tenantId]),
    safeFirst(env,"SELECT state_json,version FROM app_state WHERE tenant_id=? LIMIT 1",[tenantId])
  ]);
  const state=safeJson(stateRow?.state_json,{});
  const memory=management?ownerEnteredMemory(state,tenant?.name):frozen({restricted:true,source:"owner_workspace_profile"});
  const sales=management?salesMemory(state,{businessDate}):frozen({restricted:true});
  return frozen({
    version:BUSINESS_CONTEXT_VERSION,
    observedAt:new Date(now).toISOString(),
    businessDate,
    roleScope:frozen({actorRole:role,managementContext:management,finance:true,compliance:true}),
    identity:frozen({tenantName:clean(tenant?.name,160)||null}),
    finance:frozen({
      ...finance,
      receivables:frozen({
        outstandingInvoiceCount:Number(receivables?.outstandingInvoiceCount||0),
        outstandingMinor:Number(receivables?.outstandingMinor||0),
        overdueInvoiceCount:Number(receivables?.overdueInvoiceCount||0),
        overdueMinor:Number(receivables?.overdueMinor||0),
        overdueCustomerCount:Number(receivables?.overdueCustomerCount||0),
        customers:management?receivables.customers:frozen([])
      }),
      today:collections
    }),
    operations,
    compliance,
    memory,
    sales,
    provenance:frozen({
      authoritative:frozen(["finance_accounts","finance_transactions","finance_reconciliation_runs","finance_invoices","finance_invoice_allocations","daily_operations_summaries","workflow_jobs","performance_insights","compliance_obligations"]),
      ownerEntered:management?frozen(["app_state.active_company.profile","app_state.active_company.salesIntelligence"]):frozen([]),
      rule:"Authoritative records and owner-entered assumptions remain explicitly separated; Thebe must not promote assumptions into observed facts."
    })
  });
}

function priority(key,severity,title,detail,sourceRefs,actionKey=null){
  return frozen({key,severity,title,detail,sourceRefs:frozen(sourceRefs),actionKey,executionAllowed:false,humanReviewRequired:true});
}

export function deriveBusinessPriorities(context){
  const out=[],finance=context?.finance||{},recon=finance.reconciliation||{},receivables=finance.receivables||{},ops=context?.operations||{},compliance=context?.compliance||{},sales=context?.sales||{};
  if(Number(recon.unresolvedCount||0)>0)out.push(priority(
    "reconciliation_exception","high","Review finance reconciliation exceptions",
    `${Number(recon.unresolvedCount||0)} exception(s) represent ${pulaMinor(recon.unresolvedExposureMinor)} of recorded reconciliation exposure.`,
    ["finance_reconciliation_runs"],"finance_reconciliation.prepare"
  ));
  if(Number(receivables.overdueMinor||0)>0)out.push(priority(
    "overdue_receivables","high","Collect overdue customer balances",
    `${pulaMinor(receivables.overdueMinor)} is overdue across ${Number(receivables.overdueInvoiceCount||0)} issued invoice(s).`,
    ["finance_invoices","finance_invoice_allocations"],"receivables_summary.read"
  ));
  if(Number(compliance.overdueCount||0)>0)out.push(priority(
    "overdue_compliance","high","Review overdue compliance obligations",
    `${Number(compliance.overdueCount||0)} compliance obligation(s) are recorded as overdue.`,
    ["compliance_obligations"],"compliance_action_plan.prepare"
  ));
  if(Number(ops.failedWorkflowCount||0)>0)out.push(priority(
    "failed_workflows","high","Resolve failed operational workflows",
    `${Number(ops.failedWorkflowCount||0)} workflow(s) are recorded as failed or dead.`,
    ["workflow_jobs"],"daily_operations_brief.prepare"
  ));
  if(Number(ops.criticalPerformanceSignals||0)>0)out.push(priority(
    "critical_performance","medium","Review critical business signals",
    `${Number(ops.criticalPerformanceSignals||0)} critical performance signal(s) remain open or acknowledged.`,
    ["performance_insights"],"management_brief.prepare"
  ));
  if(Number(sales.dormantQuotationCount||0)>0)out.push(priority(
    "dormant_quotations","medium","Follow up dormant quotations",
    `${Number(sales.dormantQuotationCount||0)} dormant quotation(s) represent P${Number(sales.dormantQuotationValueBwp||0).toLocaleString("en-BW",{maximumFractionDigits:2})} of owner-recorded quote value.`,
    ["app_state.active_company.salesIntelligence"],null
  ));
  if(recon.stale===true)out.push(priority(
    "stale_reconciliation","medium","Refresh finance reconciliation",
    "The latest recorded finance reconciliation is older than the freshness threshold.",
    ["finance_reconciliation_runs"],"finance_reconciliation.prepare"
  ));
  return frozen(out.slice(0,6));
}

export function buildDailyBusinessBrief(context){
  const priorities=deriveBusinessPriorities(context),finance=context?.finance||{},receivables=finance.receivables||{},compliance=context?.compliance||{},ops=context?.operations||{};
  const headline=[
    `Recorded cash ${pulaMinor(finance.cashPositionMinor)}`,
    `${pulaMinor(receivables.outstandingMinor)} customer receivables`,
    `${Number(compliance.overdueCount||0)} overdue compliance item(s)`,
    `${Number(ops.failedWorkflowCount||0)} failed workflow(s)`
  ].join(" · ");
  return frozen({
    version:BUSINESS_CONTEXT_VERSION,
    observedAt:context?.observedAt||new Date().toISOString(),
    businessDate:context?.businessDate||gaboroneDate(),
    headline,
    priorities,
    metrics:frozen({
      currency:"BWP",
      cashPositionMinor:Number(finance.cashPositionMinor||0),
      positiveInflowTodayMinor:Number(finance?.today?.positiveInflowMinor||0),
      customerCollectionsTodayMinor:Number(finance?.today?.customerCollectionMinor||0),
      receivablesOutstandingMinor:Number(receivables.outstandingMinor||0),
      receivablesOverdueMinor:Number(receivables.overdueMinor||0),
      reconciliationExceptionCount:Number(finance?.reconciliation?.unresolvedCount||0),
      reconciliationExposureMinor:Number(finance?.reconciliation?.unresolvedExposureMinor||0),
      overdueComplianceCount:Number(compliance.overdueCount||0),
      complianceDueWithin14Days:Number(compliance.dueWithin14Days||0),
      pendingWorkflowCount:Number(ops.pendingWorkflowCount||0),
      failedWorkflowCount:Number(ops.failedWorkflowCount||0),
      criticalPerformanceSignals:Number(ops.criticalPerformanceSignals||0)
    }),
    authority:frozen({
      readOnly:true,
      executionAllowed:false,
      approvalStillRequired:true,
      runtimeGuardBypassed:false,
      assumptionsRemainNonAuthoritative:true
    }),
    provenance:context?.provenance||null
  });
}

export function businessBriefText(brief){
  const lines=[`Thebe Desk owner brief · ${brief?.businessDate||gaboroneDate()}`,clean(brief?.headline,1000)];
  const priorities=Array.isArray(brief?.priorities)?brief.priorities.slice(0,3):[];
  if(priorities.length){
    lines.push("Attention:");
    priorities.forEach((item,index)=>lines.push(`${index+1}. ${clean(item.title,160)} — ${clean(item.detail,300)}`));
  }else{
    lines.push("No configured exception threshold is currently crossed. Continue recording finance, operations and compliance data.");
  }
  lines.push("Read-only brief. Review source records before acting.");
  return lines.filter(Boolean).join("\n").slice(0,3900);
}

export async function handleBusinessContextRequest({request,url,env,auth,json,roleAllowed}){
  if(!url.pathname.startsWith("/api/business-context"))return null;
  if(request.method!=="GET")return json({error:"method_not_allowed"},405,{"allow":"GET"});
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  const context=await buildBusinessContext(env,auth.tenant_id,{actorRole:auth.role});
  if(url.pathname==="/api/business-context/snapshot")return json(context);
  if(url.pathname==="/api/business-context/brief")return json({contextVersion:context.version,brief:buildDailyBusinessBrief(context)});
  return json({error:"not_found"},404);
}

export const __businessContextTest=frozen({
  gaboroneDate,
  ownerEnteredMemory,
  salesMemory,
  deriveBusinessPriorities,
  buildDailyBusinessBrief,
  businessBriefText
});
