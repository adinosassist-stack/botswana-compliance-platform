import {financeSummary} from "./finance-core.js";
import {financeReceivablesSummary,financeDailyCollections} from "./finance-receivables.js";
import {financePayablesSummary} from "./finance-payables.js";
import {listBusinessMemory} from "./business-memory.js";
import {buildMoneyIntelligence} from "./money-intelligence.js";
import {languagePreferenceFromMemory,deterministicLanguagePolicy,deterministicLanguageNotice} from "./thebe-language.js";
import {DEFAULT_RUNTIME_MARKET_CODE,runtimeMarketProfile,marketBusinessDate,formatMarketMajor,formatMarketMinor} from "./market-profile.js";
import {buildBusinessAnalytics} from "./business-analytics.js";
import {propertyPortfolioSummary} from "./property-portfolio.js";

export const BUSINESS_CONTEXT_VERSION="2026-09-27.v175";

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
function activeMarketContext(){
  const profile=runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE);
  if(!profile)throw new Error("No active runtime market profile");
  return frozen({
    code:profile.code,
    country:profile.country,
    rolloutStatus:profile.rolloutStatus,
    currency:profile.currency,
    currencySymbol:profile.currencySymbol,
    locale:profile.locale,
    timeZone:profile.timeZone,
    regulatoryPack:profile.regulatoryPack
  });
}
const activeBusinessDate=(now=new Date(),marketCode=DEFAULT_RUNTIME_MARKET_CODE)=>marketBusinessDate(now,marketCode);
const activeMarketMinor=(value,marketCode=DEFAULT_RUNTIME_MARKET_CODE)=>formatMarketMinor(value,{marketCode});
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

function salesMemory(state,{businessDate=activeBusinessDate()}={}){
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
  const [row,coverage]=await Promise.all([
    safeFirst(env,`SELECT
      SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END) overdue_count,
      SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP AND due_at<datetime('now','+14 days') THEN 1 ELSE 0 END) due_14d_count,
      MIN(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP THEN due_at END) next_due_at
      FROM compliance_obligations WHERE tenant_id=?`,[tenantId]),
    safeFirst(env,`SELECT
      SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published_rule_count,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) approved_unpublished_rule_count
      FROM regulatory_rules`)
  ]);
  const coverageKnown=coverage!==null;
  const publishedRuleCount=coverageKnown?Number(coverage?.published_rule_count||0):null;
  const approvedUnpublishedRuleCount=coverageKnown?Number(coverage?.approved_unpublished_rule_count||0):null;
  return frozen({
    overdueCount:Number(row?.overdue_count||0),
    dueWithin14Days:Number(row?.due_14d_count||0),
    nextDueAt:row?.next_due_at||null,
    publishedRuleCount,
    approvedUnpublishedRuleCount,
    ruleCoverageStatus:coverageKnown?(publishedRuleCount>0?"active":"inactive"):"unknown"
  });
}

async function buildBusinessContextBase(env,tenantId,{actorRole="owner",now=new Date()}={}){
  const market=activeMarketContext(),role=String(actorRole||"").toLowerCase(),businessDate=marketBusinessDate(now,market.code);
  const management=role==="owner"||role==="manager";
  const [finance,receivables,payables,collections,operations,compliance,property,tenant,stateRow,durableMemory]=await Promise.all([
    financeSummary(env,tenantId),
    financeReceivablesSummary(env,tenantId,{businessDate,customerLimit:management?8:1,invoiceLimit:management?20:1}),
    management?financePayablesSummary(env,tenantId,{businessDate,supplierLimit:8,payableLimit:30}):Promise.resolve(frozen({available:false,restricted:true,payables:frozen([]),suppliers:frozen([])})),
    financeDailyCollections(env,tenantId,{businessDate}),
    operationsContext(env,tenantId,{allowed:management}),
    complianceContext(env,tenantId),
    management?propertyPortfolioSummary(env,tenantId,{businessDate}):Promise.resolve(frozen({available:false,restricted:true,items:frozen([])})),
    safeFirst(env,"SELECT name FROM tenants WHERE id=? LIMIT 1",[tenantId]),
    safeFirst(env,"SELECT state_json,version FROM app_state WHERE tenant_id=? LIMIT 1",[tenantId]),
    management?listBusinessMemory(env,tenantId):Promise.resolve(frozen({schemaReady:true,items:frozen([]),authoritative:false,restricted:true}))
  ]);
  const state=safeJson(stateRow?.state_json,{});
  const profileMemory=management?ownerEnteredMemory(state,tenant?.name):frozen({restricted:true,source:"owner_workspace_profile"});
  const memory=management?mergeConfirmedMemory(profileMemory,durableMemory):profileMemory;
  const sales=management?salesMemory(state,{businessDate}):frozen({restricted:true});
  const moneyIntelligence=management?await buildMoneyIntelligence(env,tenantId,{businessDate,cashPositionMinor:Number(finance?.cashPositionMinor||0),memory,receivables,payables,reconciliationStale:finance?.reconciliation?.stale===true}):frozen({available:false,restricted:true});
  return frozen({
    version:BUSINESS_CONTEXT_VERSION,
    observedAt:new Date(now).toISOString(),
    businessDate,
    market,
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
    property:management?property:frozen({available:false,restricted:true,items:frozen([])}),
    memory,
    durableMemory,
    language:languagePreferenceFromMemory(durableMemory),
    sales,
    moneyIntelligence,
    provenance:frozen({
      authoritative:frozen(["finance_accounts","finance_transactions","finance_reconciliation_runs","finance_invoices","finance_invoice_allocations","finance_suppliers","finance_supplier_aliases","finance_payables","finance_payable_allocations","property_assets","property_professional_valuations","property_valuation_evidence_links","property_operating_snapshots","evidence","daily_operations_summaries","workflow_jobs","performance_insights","compliance_obligations"]),
      ownerEntered:management?frozen(["app_state.active_company.profile","app_state.active_company.salesIntelligence","business_memory_items"]):frozen([]),
      rule:"Authoritative records and owner-entered assumptions remain explicitly separated; Thebe must not promote assumptions into observed facts."
    })
  });
}

export async function buildBusinessContext(env,tenantId,options={}){
  const context=await buildBusinessContextBase(env,tenantId,options);
  return frozen({...context,analytics:buildBusinessAnalytics(context)});
}

function setswanaPriority(item,metrics={},marketCode=DEFAULT_RUNTIME_MARKET_CODE){
  const money=value=>activeMarketMinor(value,marketCode);
  const map={
    reconciliation_exception:{title:"Sekaseka diphapang tsa poelanyo ya madi",detail:`${Number(metrics.reconciliationExceptionCount||0)} diphapang di emela ${money(metrics.reconciliationExposureMinor)} ya exposure e e rekotilweng.`},
    overdue_receivables:{title:"Latela madi a bareki a a fetileng nako",detail:`${money(metrics.receivablesOverdueMinor)} e fetile nako mo di-invoice di le ${Number(metrics.receivablesOverdueInvoiceCount||0)}.`},
    overdue_payables:{title:"Sekaseka dikoloto tsa suppliers tse di fetileng nako",detail:`${money(metrics.payablesOverdueMinor)} e fetile nako mo payables di le ${Number(metrics.payablesOverdueCount||0)}.`},
    payables_due_14d:{title:"Sekaseka supplier commitments tsa malatsi a 14",detail:`${money(metrics.payablesDue14dMinor)} ya recorded payables e due mo malatsing a 14.`},
    overdue_compliance:{title:"Sekaseka maikarabelo a compliance a a fetileng nako",detail:`Go na le maikarabelo a compliance a ${Number(metrics.overdueComplianceCount||0)} a a rekotilweng a fetile nako.`},
    failed_workflows:{title:"Rarabolola ditsela tsa tiro tse di paletsweng",detail:`Go na le workflow di le ${Number(metrics.failedWorkflowCount||0)} tse di rekotilweng di paletswe kgotsa di emetse tharabololo.`},
    critical_performance:{title:"Sekaseka ditemoso tsa botlhokwa tsa kgwebo",detail:`Go na le ditemoso tsa botlhokwa di le ${Number(metrics.criticalPerformanceSignals||0)} tse di sa ntseng di butse.`},
    dormant_quotations:{title:"Latela dikhoutheishene tse di sa tsweleleng",detail:`${Number(metrics.dormantQuotationCount||0)} dikhoutheishene di emela ${formatMarketMajor(metrics.dormantQuotationValueBwp,{marketCode,maximumFractionDigits:2})} ya boleng jo bo rekotilweng ke mong.`},
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
    expense_category_concentration:{title:"Sekaseka expense-category concentration",detail:"Category e le nngwe e tsaya karolo e kgolo ya matched outflows ka owner-confirmed supplier aliases. Seno ga se accounting posting."},
    supplier_outflow_acceleration:{title:"Sekaseka supplier cash-outflow change",detail:"Matched cash outflow ya supplier e oketsegile kgatlhanong le malatsi a 30 a pele. Seno se ka bakiwa ke volume, timing kgotsa price; ga se unit-price inflation claim."},
    supplier_payable_concentration:{title:"Sekaseka supplier payable concentration",detail:"Supplier a le mongwe o emela karolo e kgolo ya outstanding recorded supplier payables."},
    payable_cover_shortfall_14d:{title:"Sekaseka 14-day payable cover shortfall",detail:"Recorded cash ga e lekane recorded overdue le next-14-day supplier payables. Seno ga se full liquidity forecast."},
    payable_cover_tight_14d:{title:"Sekaseka 14-day payable cover",detail:"Recorded cash e kwa gaufi le recorded overdue le next-14-day supplier payables. Seno ga se full liquidity forecast."},
    weekly_spend_envelope_zero:{title:"Sekaseka 7-day discretionary spend envelope",detail:"Conservative spend envelope ke zero morago ga recorded supplier payables tsa malatsi a 7, full monthly labour reserve le minimum cash buffer tse mong a di tsentseng."}
  };
  return map[item?.key]||{title:item?.title,detail:item?.detail};
}
function localizeBriefPriority(item,metrics,language,marketCode=DEFAULT_RUNTIME_MARKET_CODE){
  if(language?.render!=="setswana")return item;
  const localized=setswanaPriority(item,metrics,marketCode);
  return frozen({...item,title:localized.title,detail:localized.detail});
}
function briefHeadline({finance={},receivables={},compliance={},ops={},language,marketCode=DEFAULT_RUNTIME_MARKET_CODE}){
  const money=value=>activeMarketMinor(value,marketCode);
  const coverageStatus=String(compliance?.ruleCoverageStatus||"");
  const complianceHeadline=coverageStatus==="inactive"
    ?"Regulatory coverage inactive"
    :coverageStatus==="unknown"
      ?"Regulatory coverage unknown"
      :`${Number(compliance.overdueCount||0)} overdue compliance item(s)`;
  if(language?.render==="setswana")return [
    `Madi a a rekotilweng ${money(finance.cashPositionMinor)}`,
    `${money(receivables.outstandingMinor)} ya dikoloto tsa bareki`,
    complianceHeadline,
    `${Number(ops.failedWorkflowCount||0)} workflow tse di paletsweng`
  ].join(" · ");
  return [
    `Recorded cash ${money(finance.cashPositionMinor)}`,
    `${money(receivables.outstandingMinor)} customer receivables`,
    complianceHeadline,
    `${Number(ops.failedWorkflowCount||0)} failed workflow(s)`
  ].join(" · ");
}

function priority(key,severity,title,detail,sourceRefs,actionKey=null){
  return frozen({key,severity,title,detail,sourceRefs:frozen(sourceRefs),actionKey,executionAllowed:false,humanReviewRequired:true});
}

export function deriveBusinessPriorities(context){
  const marketCode=context?.market?.code||DEFAULT_RUNTIME_MARKET_CODE,formatMoney=value=>activeMarketMinor(value,marketCode),out=[],finance=context?.finance||{},recon=finance.reconciliation||{},receivables=finance.receivables||{},ops=context?.operations||{},compliance=context?.compliance||{},sales=context?.sales||{},money=context?.moneyIntelligence||{};
  if(Number(recon.unresolvedCount||0)>0)out.push(priority(
    "reconciliation_exception","high","Review finance reconciliation exceptions",
    `${Number(recon.unresolvedCount||0)} exception(s) represent ${formatMoney(recon.unresolvedExposureMinor)} of recorded reconciliation exposure.`,
    ["finance_reconciliation_runs"],"finance_reconciliation.prepare"
  ));
  if(Number(receivables.overdueMinor||0)>0)out.push(priority(
    "overdue_receivables","high","Collect overdue customer balances",
    `${formatMoney(receivables.overdueMinor)} is overdue across ${Number(receivables.overdueInvoiceCount||0)} issued invoice(s).`,
    ["finance_invoices","finance_invoice_allocations"],"receivables_summary.read"
  ));
  const payables=finance.payables||{};
  if(Number(payables.overdueMinor||0)>0)out.push(priority(
    "overdue_payables","high","Review overdue supplier payables",
    `${formatMoney(payables.overdueMinor)} is overdue across ${Number(payables.overduePayableCount||0)} recorded payable(s).`,
    ["finance_suppliers","finance_payables","finance_payable_allocations"],null
  ));
  else if(Number(payables.due14dMinor||0)>0)out.push(priority(
    "payables_due_14d","medium","Review supplier cash commitments due within 14 days",
    `${formatMoney(payables.due14dMinor)} of recorded supplier payables falls due within 14 days.`,
    ["finance_suppliers","finance_payables","finance_payable_allocations"],null
  ));
  if(String(compliance?.ruleCoverageStatus||"")==="inactive")out.push(priority(
    "compliance_rule_coverage_inactive","high","Activate reviewed compliance rule coverage",
    `No published regulatory rules are active. ${Number(compliance?.approvedUnpublishedRuleCount||0)} approved rule(s) remain unpublished. A zero overdue count is not compliance assurance; publish only through the existing maker-checker governance flow.`,
    ["regulatory_rules","regulatory_rule_reviews","regulatory_sources"],null
  ));
  else if(String(compliance?.ruleCoverageStatus||"")==="unknown")out.push(priority(
    "compliance_rule_coverage_unknown","medium","Verify compliance rule coverage",
    "Thebe could not verify whether regulatory rules are published. It will not infer compliance coverage from a zero obligation count.",
    ["regulatory_rules"],null
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
    `${Number(sales.dormantQuotationCount||0)} dormant quotation(s) represent ${formatMarketMajor(sales.dormantQuotationValueBwp,{marketCode:"BW",maximumFractionDigits:2})} of owner-recorded quote value.`,
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
    else if(signal?.key==="supplier_outflow_acceleration")out.push(priority("supplier_outflow_acceleration","medium","Review supplier cash-outflow change",clean(signal.detail,300),["finance_transactions","finance_supplier_aliases","finance_suppliers"],null));
    else if(signal?.key==="supplier_payable_concentration")out.push(priority("supplier_payable_concentration","medium","Review supplier payable concentration",clean(signal.detail,300),["finance_suppliers","finance_payables","finance_payable_allocations"],null));
    else if(signal?.key==="payable_cover_shortfall_14d")out.push(priority("payable_cover_shortfall_14d","high","Review 14-day payable cover shortfall",clean(signal.detail,300),["finance_accounts","finance_payables","finance_payable_allocations"],null));
    else if(signal?.key==="payable_cover_tight_14d")out.push(priority("payable_cover_tight_14d","medium","Review 14-day payable cover",clean(signal.detail,300),["finance_accounts","finance_payables","finance_payable_allocations"],null));
    else if(signal?.key==="weekly_spend_envelope_zero")out.push(priority("weekly_spend_envelope_zero","high","Review weekly discretionary spend envelope",clean(signal.detail,300),["finance_accounts","finance_payables","business_memory_items"],null));
  }
  if(recon.stale===true)out.push(priority(
    "stale_reconciliation","medium","Refresh finance reconciliation",
    "The latest recorded finance reconciliation is older than the freshness threshold.",
    ["finance_reconciliation_runs"],"finance_reconciliation.prepare"
  ));
  return frozen(out.slice(0,6));
}

export function buildDailyBusinessBrief(context){
  const market=context?.market||activeMarketContext(),basePriorities=deriveBusinessPriorities(context),finance=context?.finance||{},receivables=finance.receivables||{},compliance=context?.compliance||{},ops=context?.operations||{},sales=context?.sales||{},money=context?.moneyIntelligence||{},trend=money?.trend||{},assumptions=money?.assumptions||{};
  const preference=context?.language||languagePreferenceFromMemory(context?.durableMemory),language=deterministicLanguagePolicy(preference);
  const metrics=frozen({
    currency:market.currency,
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
    learnedExpenseCategoryCount:Number(money?.expenseLearning?.categories?.length||0),
    supplierSpendIncreaseCount:(money?.supplierSpendTrends||[]).filter(item=>item?.attention==="increase").length,
    topSupplierPayableShare:money?.payableConcentration?.topSupplier?.shareOfOutstanding==null?null:Number(money.payableConcentration.topSupplier.shareOfOutstanding),
    payableCoverage14dRatio:money?.commitmentStress?.coverageRatio==null?null:Number(money.commitmentStress.coverageRatio),
    payableShortfall14dMinor:Number(money?.commitmentStress?.shortfallMinor||0),
    weeklySpendEnvelopeReady:money?.spendEnvelope?.ready===true,
    weeklySpendEnvelopeMinor:money?.spendEnvelope?.discretionaryEnvelopeMinor==null?null:Number(money.spendEnvelope.discretionaryEnvelopeMinor),
    weeklySpendAfterPlannedPurchaseMinor:money?.spendEnvelope?.discretionaryAfterPlannedPurchaseMinor==null?null:Number(money.spendEnvelope.discretionaryAfterPlannedPurchaseMinor),
    weeklySpendPayrollReserveMinor:money?.spendEnvelope?.payrollReserveMinor==null?null:Number(money.spendEnvelope.payrollReserveMinor),
    weeklySpendMissingInputCount:Array.isArray(money?.spendEnvelope?.missingInputs)?money.spendEnvelope.missingInputs.length:0,
    weeklySpendBlockingEvidenceCount:Array.isArray(money?.spendEnvelope?.blockingEvidence)?money.spendEnvelope.blockingEvidence.length:0
  });
  const priorities=frozen(basePriorities.map(item=>localizeBriefPriority(item,metrics,language,market.code)));
  return frozen({
    version:BUSINESS_CONTEXT_VERSION,
    observedAt:context?.observedAt||new Date().toISOString(),
    businessDate:context?.businessDate||marketBusinessDate(new Date(),market.code),
    market,
    language:frozen({...preference,deterministic:language,fallbackNotice:deterministicLanguageNotice(preference)}),
    headline:briefHeadline({finance,receivables,compliance,ops,language,marketCode:market.code}),
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
    analytics:context?.analytics||buildBusinessAnalytics(context),
    provenance:context?.provenance||null
  });
}

export function businessBriefText(brief){
  const render=brief?.language?.deterministic?.render||"english",setswana=render==="setswana",marketCode=brief?.market?.code||DEFAULT_RUNTIME_MARKET_CODE;
  const lines=[setswana?`Thebe Desk · Kakaretso ya kgwebo · ${brief?.businessDate||activeBusinessDate(new Date(),marketCode)}`:`Thebe Desk owner brief · ${brief?.businessDate||activeBusinessDate(new Date(),marketCode)}`,clean(brief?.headline,1000)];
  if(brief?.language?.fallbackNotice)lines.push(clean(brief.language.fallbackNotice,500));
  const spend=brief?.moneyIntelligence?.spendEnvelope;
  if(spend?.ready===true){
    lines.push(setswana
      ?`7-day discretionary planning envelope: ${activeMarketMinor(spend.discretionaryEnvelopeMinor,marketCode)} morago ga recorded supplier payables, full monthly labour reserve le minimum cash buffer. Receivables ga di a tsewa e le collected.`
      :`7-day discretionary planning envelope: ${activeMarketMinor(spend.discretionaryEnvelopeMinor,marketCode)} after recorded supplier payables, the full monthly labour reserve and minimum cash buffer. Receivables are not assumed collected.`);
  }else if(Array.isArray(spend?.missingInputs)&&spend.missingInputs.length){
    lines.push(setswana
      ?"Seta monthly labour cost le minimum cash buffer go kgontsha 7-day discretionary planning envelope."
      :"Set monthly labour cost and minimum cash buffer to enable the 7-day discretionary planning envelope.");
  }else if(spend?.state==="needs_inputs_and_finance_review"){
    lines.push(setswana
      ?"7-day discretionary planning envelope e tlhoka owner assumptions mme gape e emetse finance reconciliation le supplier-payables evidence."
      :"The 7-day discretionary planning envelope needs owner assumptions and is also withheld until finance reconciliation and supplier-payables evidence are current.");
  }else if(spend?.state==="needs_finance_review"){
    lines.push(setswana
      ?"7-day discretionary planning envelope ga e bontshiwe go fitlha finance reconciliation le supplier-payables evidence di siame."
      :"The 7-day discretionary planning envelope is withheld until finance reconciliation and supplier-payables evidence are current.");
  }
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
  if(url.pathname==="/api/business-context/analytics")return json({contextVersion:context.version,analytics:context.analytics});
  if(url.pathname==="/api/business-context/brief")return json({contextVersion:context.version,brief:buildDailyBusinessBrief(context),analytics:context.analytics});
  return json({error:"not_found"},404);
}

export const __businessContextTest=frozen({
  activeMarketContext,
  gaboroneDate:activeBusinessDate,
  activeBusinessDate,
  activeMarketMinor,
  ownerEnteredMemory,
  mergeConfirmedMemory,
  salesMemory,
  localizeBriefPriority,
  briefHeadline,
  deriveBusinessPriorities,
  buildDailyBusinessBrief,
  businessBriefText
});
