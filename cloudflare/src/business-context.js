import {financeSummary} from "./finance-core.js";
import {financeReceivablesSummary,financeDailyCollections} from "./finance-receivables.js";
import {financePayablesSummary} from "./finance-payables.js";
import {listBusinessMemory} from "./business-memory.js";
import {buildMoneyIntelligence} from "./money-intelligence.js";
import {languagePreferenceFromMemory,deterministicLanguagePolicy,deterministicLanguageNotice} from "./thebe-language.js";

export const BUSINESS_CONTEXT_VERSION="2026-09-26.v161";

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

function mergeConfirmedMemory(base,durable){
  const items=Array.isArray(durable?.items)?durable.items:[];
  if(!items.length)return base;
  const map=new Map(items.map(item=>[`${item?.namespace||""}.${item?.key||""}`,item?.value]));
  const assumptions={...(base?.assumptions||{})};
  const numericBindings=Object.freeze({
    "business.monthly_revenue_target_bwp":"monthlyRevenueTargetBwp",
    "finance.minimum_cash_buffer_bwp":"minimumCashBufferBwp",
    "finance.monthly_outflows_bwp":"monthlyCashOutflowsBwp",
    "finance.monthly_labour_cost_bwp":"monthlyLabourCostBwp",
    "finance.planned_purchase_bwp":"plannedPurchaseBwp",
    "operations.operating_days_per_month":"operatingDaysPerMonth",
    "sales.same_month_collection_pct":"sameMonthCollectionPct"
  });
  for(const [memoryKey,target] of Object.entries(numericBindings)){
    if(!map.has(memoryKey))continue;
    const value=finite(map.get(memoryKey));
    if(value!==null)assumptions[target]=value;
  }
  if(map.has("business.planned_purchase_label"))assumptions.plannedPurchaseLabel=clean(map.get("business.planned_purchase_label"),80)||null;
  return frozen({
    ...base,
    assumptions:frozen(assumptions),
    durableMemoryApplied:true,
    durableMemorySource:"owner_confirmed_business_memory"
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
  const [finance,receivables,payables,collections,operations,compliance,tenant,stateRow,durableMemory]=await Promise.all([
    financeSummary(env,tenantId),
    financeReceivablesSummary(env,tenantId,{businessDate,customerLimit:management?8:1,invoiceLimit:management?20:1}),
    management?financePayablesSummary(env,tenantId,{businessDate,supplierLimit:8,payableLimit:30}):Promise.resolve(frozen({available:false,restricted:true,payables:frozen([]),suppliers:frozen([])})),
    financeDailyCollections(env,tenantId,{businessDate}),
    operationsContext(env,tenantId,{allowed:management}),
    complianceContext(env,tenantId),
    safeFirst(env,"SELECT name FROM tenants WHERE id=? LIMIT 1",[tenantId]),
    safeFirst(env,"SELECT state_json,version FROM app_state WHERE tenant_id=? LIMIT 1",[tenantId]),
    management?listBusinessMemory(env,tenantId):Promise.resolve(frozen({schemaReady:true,items:frozen([]),authoritative:false,restricted:true}))
  ]);
  const state=safeJson(stateRow?.state_json,{});
  const profileMemory=management?ownerEnteredMemory(state,tenant?.name):frozen({restricted:true,source:"owner_workspace_profile"});
  const memory=management?mergeConfirmedMemory(profileMemory,durableMemory):profileMemory;
  const sales=management?salesMemory(state,{businessDate}):frozen({restricted:true});
  const moneyIntelligence=management?await buildMoneyIntelligence(env,tenantId,{businessDate,cashPositionMinor:Number(finance?.cashPositionMinor||0),memory,receivables,payables}):frozen({available:false,restricted:true});
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
        due7dMinor:Number(receivables?.due7dMinor||0),
        due14dMinor:Number(receivables?.due14dMinor||0),
        due30dMinor:Number(receivables?.due30dMinor||0),
        overdueCustomerCount:Number(receivables?.overdueCustomerCount||0),
        customers:management?receivables.customers:frozen([]),
        invoices:management?receivables.invoices:frozen([])
      }),
      payables:management?payables:frozen({available:false,restricted:true}),
      today:collections
    }),
    operations,
    compliance,
    memory,
    durableMemory,
    language:languagePreferenceFromMemory(durableMemory),
    sales,
    moneyIntelligence,
    provenance:frozen({
      authoritative:frozen(["finance_accounts","finance_transactions","finance_reconciliation_runs","finance_invoices","finance_invoice_allocations","finance_suppliers","finance_supplier_aliases","finance_payables","finance_payable_allocations","daily_operations_summaries","workflow_jobs","performance_insights","compliance_obligations"]),
      ownerEntered:management?frozen(["app_state.active_company.profile","app_state.active_company.salesIntelligence","business_memory_items"]):frozen([]),
      rule:"Authoritative records and owner-entered assumptions remain explicitly separated; Thebe must not promote assumptions into observed facts."
    })
  });
}

function setswanaPriority(item,metrics={}){
  const money=pulaMinor;
  const map={
    reconciliation_exception:{title:"Sekaseka diphapang tsa poelanyo ya madi",detail:`${Number(metrics.reconciliationExceptionCount||0)} diphapang di emela ${money(metrics.reconciliationExposureMinor)} ya exposure e e rekotilweng.`},
    overdue_receivables:{title:"Latela madi a bareki a a fetileng nako",detail:`${money(metrics.receivablesOverdueMinor)} e fetile nako mo di-invoice di le ${Number(metrics.receivablesOverdueInvoiceCount||0)}.`},
    overdue_payables:{title:"Sekaseka dikoloto tsa suppliers tse di fetileng nako",detail:`${money(metrics.payablesOverdueMinor)} e fetile nako mo payables di le ${Number(metrics.payablesOverdueCount||0)}.`},
    payables_due_14d:{title:"Sekaseka supplier commitments tsa malatsi a 14",detail:`${money(metrics.payablesDue14dMinor)} ya recorded payables e due mo malatsing a 14.`},
    overdue_compliance:{title:"Sekaseka maikarabelo a compliance a a fetileng nako",detail:`Go na le maikarabelo a compliance a ${Number(metrics.overdueComplianceCount||0)} a a rekotilweng a fetile nako.`},
    failed_workflows:{title:"Rarabolola ditsela tsa tiro tse di paletsweng",detail:`Go na le workflow di le ${Number(metrics.failedWorkflowCount||0)} tse di rekotilweng di paletswe kgotsa di emetse tharabololo.`},
    critical_performance:{title:"Sekaseka ditemoso tsa botlhokwa tsa kgwebo",detail:`Go na le ditemoso tsa botlhokwa di le ${Number(metrics.criticalPerformanceSignals||0)} tse di sa ntseng di butse.`},
    dormant_quotations:{title:"Latela dikhoutheishene tse di sa tsweleleng",detail:`${Number(metrics.dormantQuotationCount||0)} dikhoutheishene di emela P${Number(metrics.dormantQuotationValueBwp||0).toLocaleString("en-BW",{maximumFractionDigits:2})} ya boleng jo bo rekotilweng ke mong.`},
    cash_runway:{title:"Sekaseka nako e madi a ka tswelelang ka yone",detail:`Runway e e fopholeditsweng ke matsatsi a ${metrics.estimatedRunwayDays==null?"—":Number(metrics.estimatedRunwayDays)} go ya ka monthly outflows tse mong a di tsentseng.`},
    outflow_acceleration:{title:"Sekaseka koketsego ya madi a tswang",detail:`Madi a a tswang mo malatsing a 30 a fetileng a fetogile ka ${metrics.outflowChangePct==null?"—":Math.round(Number(metrics.outflowChangePct)*100)+"%"} fa a bapisiwa le malatsi a 30 a pele.`},
    large_debits:{title:"Sekaseka ditlhakololo tsa madi tse dikgolo",detail:`Go na le debit di le ${Number(metrics.largeDebitCount||0)} tse di fetang deterministic large-debit threshold.`},
    stale_reconciliation:{title:"Ntšhafatsa poelanyo ya madi",detail:"Poelanyo ya madi e e rekotilweng ya bofelo e feta freshness threshold."},
    cash_buffer_scenario:{title:"Sekaseka cash-buffer scenario",detail:"Owner-assumption cash scenario e wela kwa tlase ga minimum cash buffer mo horizon e e sekasekilweng."},
    commitment_pressure:{title:"Sekaseka planned commitments",detail:"Planned one-off commitments tse mong a di tsentseng di feta cash e e kwa godimo ga minimum cash buffer."},
    debit_concentration:{title:"Sekaseka repeated debit concentration",detail:"Repeated debit description e tsaya karolo e kgolo ya outflows; supplier identity ga e a netefadiwa."},
    cash_flow_margin_pressure:{title:"Sekaseka cash-flow margin pressure",detail:"30-day cash-flow margin proxy e ka fa tlase ga zero. Seno ga se accounting gross margin kgotsa profit."},
    payables_cash_pressure_14d:{title:"Sekaseka cash pressure ya suppliers",detail:"Recorded supplier payables tse di due mo malatsing a 14 di feta recorded cash position."},
    collection_attention:{title:"Sekaseka customer collection attention",detail:"Customer o na le overdue receivables le historical on-time payment behavior e e tlhokang tlhokomelo. Seno ga se payment probability."},
    expense_category_concentration:{title:"Sekaseka expense-category concentration",detail:"Category e le nngwe e tsaya karolo e kgolo ya matched outflows ka owner-confirmed supplier aliases. Seno ga se accounting posting."}
  };
  return map[item?.key]||{title:item?.title,detail:item?.detail};
}
function localizeBriefPriority(item,metrics,language){
  if(language?.render!=="setswana")return item;
  const localized=setswanaPriority(item,metrics);
  return frozen({...item,title:localized.title,detail:localized.detail});
}
function briefHeadline({finance={},receivables={},compliance={},ops={},language}){
  if(language?.render==="setswana")return [
    `Madi a a rekotilweng ${pulaMinor(finance.cashPositionMinor)}`,
    `${pulaMinor(receivables.outstandingMinor)} ya dikoloto tsa bareki`,
    `${Number(compliance.overdueCount||0)} dilo tsa compliance tse di fetileng nako`,
    `${Number(ops.failedWorkflowCount||0)} workflow tse di paletsweng`
  ].join(" · ");
  return [
    `Recorded cash ${pulaMinor(finance.cashPositionMinor)}`,
    `${pulaMinor(receivables.outstandingMinor)} customer receivables`,
    `${Number(compliance.overdueCount||0)} overdue compliance item(s)`,
    `${Number(ops.failedWorkflowCount||0)} failed workflow(s)`
  ].join(" · ");
}

function priority(key,severity,title,detail,sourceRefs,actionKey=null){
  return frozen({key,severity,title,detail,sourceRefs:frozen(sourceRefs),actionKey,executionAllowed:false,humanReviewRequired:true});
}

export function deriveBusinessPriorities(context){
  const out=[],finance=context?.finance||{},recon=finance.reconciliation||{},receivables=finance.receivables||{},ops=context?.operations||{},compliance=context?.compliance||{},sales=context?.sales||{},money=context?.moneyIntelligence||{};
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
  const payables=finance.payables||{};
  if(Number(payables.overdueMinor||0)>0)out.push(priority(
    "overdue_payables","high","Review overdue supplier payables",
    `${pulaMinor(payables.overdueMinor)} is overdue across ${Number(payables.overduePayableCount||0)} recorded payable(s).`,
    ["finance_suppliers","finance_payables","finance_payable_allocations"],null
  ));
  else if(Number(payables.due14dMinor||0)>0)out.push(priority(
    "payables_due_14d","medium","Review supplier cash commitments due within 14 days",
    `${pulaMinor(payables.due14dMinor)} of recorded supplier payables falls due within 14 days.`,
    ["finance_suppliers","finance_payables","finance_payable_allocations"],null
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
  for(const signal of Array.isArray(money?.signals)?money.signals:[]){
    if(signal?.key==="cash_runway")out.push(priority("cash_runway","high","Review cash runway",clean(signal.detail,300),["owner_entered_assumptions","finance_transactions"],null));
    else if(signal?.key==="outflow_acceleration")out.push(priority("outflow_acceleration","medium","Review rising cash outflows",clean(signal.detail,300),["finance_transactions"],null));
    else if(signal?.key==="large_debits")out.push(priority("large_debits","medium","Review unusually large debits",clean(signal.detail,300),["finance_transactions"],null));
    else if(signal?.key==="cash_buffer_scenario")out.push(priority("cash_buffer_scenario","high","Review cash-buffer scenario",clean(signal.detail,300),["finance_transactions","owner_entered_assumptions"],null));
    else if(signal?.key==="commitment_pressure")out.push(priority("commitment_pressure","high","Review planned commitment pressure",clean(signal.detail,300),["owner_entered_assumptions"],null));
    else if(signal?.key==="debit_concentration")out.push(priority("debit_concentration","medium","Review repeated debit concentration",clean(signal.detail,300),["finance_transactions"],null));
    else if(signal?.key==="cash_flow_margin_pressure")out.push(priority("cash_flow_margin_pressure","medium","Review cash-flow margin pressure",clean(signal.detail,300),["finance_transactions"],null));
    else if(signal?.key==="payables_cash_pressure_14d")out.push(priority("payables_cash_pressure_14d","high","Review 14-day supplier cash pressure",clean(signal.detail,300),["finance_payables","finance_payable_allocations","finance_accounts"],null));
    else if(signal?.key==="collection_attention")out.push(priority("collection_attention","medium","Review customer collection attention",clean(signal.detail,300),["finance_invoices","finance_invoice_allocations"],null));
    else if(signal?.key==="expense_category_concentration")out.push(priority("expense_category_concentration","medium","Review expense-category concentration",clean(signal.detail,300),["finance_transactions","finance_supplier_aliases","finance_suppliers"],null));
  }
  if(recon.stale===true)out.push(priority(
    "stale_reconciliation","medium","Refresh finance reconciliation",
    "The latest recorded finance reconciliation is older than the freshness threshold.",
    ["finance_reconciliation_runs"],"finance_reconciliation.prepare"
  ));
  return frozen(out.slice(0,6));
}

export function buildDailyBusinessBrief(context){
  const basePriorities=deriveBusinessPriorities(context),finance=context?.finance||{},receivables=finance.receivables||{},compliance=context?.compliance||{},ops=context?.operations||{},sales=context?.sales||{},money=context?.moneyIntelligence||{},trend=money?.trend||{},assumptions=money?.assumptions||{};
  const preference=context?.language||languagePreferenceFromMemory(context?.durableMemory),language=deterministicLanguagePolicy(preference);
  const metrics=frozen({
    currency:"BWP",
    cashPositionMinor:Number(finance.cashPositionMinor||0),
    positiveInflowTodayMinor:Number(finance?.today?.positiveInflowMinor||0),
    customerCollectionsTodayMinor:Number(finance?.today?.customerCollectionMinor||0),
    receivablesOutstandingMinor:Number(receivables.outstandingMinor||0),
    receivablesOverdueMinor:Number(receivables.overdueMinor||0),
    receivablesOverdueInvoiceCount:Number(receivables.overdueInvoiceCount||0),
    payablesOutstandingMinor:Number(finance?.payables?.outstandingMinor||0),
    payablesOverdueMinor:Number(finance?.payables?.overdueMinor||0),
    payablesOverdueCount:Number(finance?.payables?.overduePayableCount||0),
    payablesDue7dMinor:Number(finance?.payables?.due7dMinor||0),
    payablesDue14dMinor:Number(finance?.payables?.due14dMinor||0),
    payablesDue30dMinor:Number(finance?.payables?.due30dMinor||0),
    reconciliationExceptionCount:Number(finance?.reconciliation?.unresolvedCount||0),
    reconciliationExposureMinor:Number(finance?.reconciliation?.unresolvedExposureMinor||0),
    reconciliationStale:finance?.reconciliation?.stale===true,
    overdueComplianceCount:Number(compliance.overdueCount||0),
    complianceDueWithin14Days:Number(compliance.dueWithin14Days||0),
    pendingWorkflowCount:Number(ops.pendingWorkflowCount||0),
    failedWorkflowCount:Number(ops.failedWorkflowCount||0),
    criticalPerformanceSignals:Number(ops.criticalPerformanceSignals||0),
    dormantQuotationCount:Number(sales.dormantQuotationCount||0),
    dormantQuotationValueBwp:Number(sales.dormantQuotationValueBwp||0),
    current30InflowMinor:Number(trend?.current30?.inflow||0),
    current30OutflowMinor:Number(trend?.current30?.outflow||0),
    current30NetMinor:Number(trend?.current30?.net||0),
    outflowChangePct:trend?.outflowChangePct==null?null:Number(trend.outflowChangePct),
    largeDebitCount:Array.isArray(trend?.largeDebits)?trend.largeDebits.length:0,
    estimatedRunwayDays:assumptions?.estimatedRunwayDays==null?null:Number(assumptions.estimatedRunwayDays),
    safeDiscretionaryMinor:assumptions?.safeDiscretionaryMinor==null?null:Number(assumptions.safeDiscretionaryMinor),
    plannedPurchaseMinor:assumptions?.plannedPurchaseMinor==null?null:Number(assumptions.plannedPurchaseMinor),
    cashFlowMarginProxyPct:money?.scenario?.cashFlowMarginProxyPct==null?null:Number(money.scenario.cashFlowMarginProxyPct),
    firstOwnerBufferBreachHorizonDays:money?.scenario?.firstOwnerBufferBreachHorizonDays==null?null:Number(money.scenario.firstOwnerBufferBreachHorizonDays),
    scenario7EndingCashMinor:Number((money?.scenario?.horizons||[]).find(item=>Number(item?.days)===7)?.ownerAssumptionEndingCashMinor||0),
    scenario30EndingCashMinor:Number((money?.scenario?.horizons||[]).find(item=>Number(item?.days)===30)?.ownerAssumptionEndingCashMinor||0),
    scenario90EndingCashMinor:Number((money?.scenario?.horizons||[]).find(item=>Number(item?.days)===90)?.ownerAssumptionEndingCashMinor||0),
    debitConcentrationCount:Array.isArray(money?.debitConcentrations)?money.debitConcentrations.length:0,
    forward7CommittedOutflowMinor:Number(money?.cashCalendar?.next7?.committedOutflowMinor||0),
    forward14CommittedOutflowMinor:Number(money?.cashCalendar?.next14?.committedOutflowMinor||0),
    forward30CommittedOutflowMinor:Number(money?.cashCalendar?.next30?.committedOutflowMinor||0),
    forward14PotentialReceivableMinor:Number(money?.cashCalendar?.next14?.potentialReceivableMinor||0),
    collectionHigherAttentionCount:(money?.collectionBehaviors||[]).filter(item=>item?.attention==="higher_attention").length,
    learnedExpenseCategoryCount:Number(money?.expenseLearning?.categories?.length||0)
  });
  const priorities=frozen(basePriorities.map(item=>localizeBriefPriority(item,metrics,language)));
  return frozen({
    version:BUSINESS_CONTEXT_VERSION,
    observedAt:context?.observedAt||new Date().toISOString(),
    businessDate:context?.businessDate||gaboroneDate(),
    language:frozen({...preference,deterministic:language,fallbackNotice:deterministicLanguageNotice(preference)}),
    headline:briefHeadline({finance,receivables,compliance,ops,language}),
    priorities,
    metrics,
    authority:frozen({
      readOnly:true,
      executionAllowed:false,
      approvalStillRequired:true,
      runtimeGuardBypassed:false,
      assumptionsRemainNonAuthoritative:true
    }),
    durableMemory:context?.durableMemory||null,
    moneyIntelligence:money,
    provenance:context?.provenance||null
  });
}

export function businessBriefText(brief){
  const render=brief?.language?.deterministic?.render||"english",setswana=render==="setswana";
  const lines=[setswana?`Thebe Desk · Kakaretso ya kgwebo · ${brief?.businessDate||gaboroneDate()}`:`Thebe Desk owner brief · ${brief?.businessDate||gaboroneDate()}`,clean(brief?.headline,1000)];
  if(brief?.language?.fallbackNotice)lines.push(clean(brief.language.fallbackNotice,500));
  const priorities=Array.isArray(brief?.priorities)?brief.priorities.slice(0,3):[];
  if(priorities.length){
    lines.push(setswana?"Tlhokomelo:":"Attention:");
    priorities.forEach((item,index)=>lines.push(`${index+1}. ${clean(item.title,160)} — ${clean(item.detail,300)}`));
  }else{
    lines.push(setswana?"Ga go na temoso e e tlhomamisitsweng e e fetang threshold mo nakong eno. Tswelela go rekota madi, ditiro le compliance.":"No configured exception threshold is currently crossed. Continue recording finance, operations and compliance data.");
  }
  lines.push(setswana?"Kakaretso ya go bala fela. Sekaseka direkoto tsa motswedi pele ga o tsaya kgato.":"Read-only brief. Review source records before acting.");
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
  mergeConfirmedMemory,
  salesMemory,
  localizeBriefPriority,
  briefHeadline,
  deriveBusinessPriorities,
  buildDailyBusinessBrief,
  businessBriefText
});
