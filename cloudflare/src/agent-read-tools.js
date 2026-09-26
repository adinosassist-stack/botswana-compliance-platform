import {evaluateAgentAction} from "./agent-policy.js";
import {financeDailyCollections,financeReceivablesSummary,financeReceivableCustomerLookup} from "./finance-receivables.js";

export const AGENT_READ_TOOLS_VERSION="2026-09-26.read-tools-v4";

const TOOL_ACTIONS=Object.freeze([
  "business_health.read",
  "financial_position.read",
  "finance_data_quality.read",
  "finance_daily_inflows.read",
  "receivables_summary.read",
  "compliance_status.read",
  "daily_operations_summary.read"
]);
const PARAMETERIZED_TOOL_ACTIONS=Object.freeze(["receivables_customer.read"]);
const SUPPORTED_TOOL_ACTIONS=Object.freeze([...TOOL_ACTIONS,...PARAMETERIZED_TOOL_ACTIONS]);

const SOURCE_REFS=Object.freeze({
  "business_health.read":"tool:business_health",
  "financial_position.read":"tool:financial_position",
  "finance_data_quality.read":"tool:finance_data_quality",
  "finance_daily_inflows.read":"tool:finance_daily_inflows",
  "receivables_summary.read":"tool:receivables_summary",
  "receivables_customer.read":"tool:receivables_customer",
  "compliance_status.read":"tool:compliance_status",
  "daily_operations_summary.read":"tool:daily_operations_summary"
});

const text=(value,max=240)=>String(value??"").trim().slice(0,max);
const number=value=>Number.isFinite(Number(value))?Number(value):0;

async function safeFirst(env,sql,bindings=[]){
  try{return {ok:true,value:await env.DB.prepare(sql).bind(...bindings).first()}}catch(error){return {ok:false,error:text(error?.message||error,160)}}
}
async function safeAll(env,sql,bindings=[]){
  try{return {ok:true,value:await env.DB.prepare(sql).bind(...bindings).all()}}catch(error){return {ok:false,error:text(error?.message||error,160)}}
}
function requireReads(reads){const failed=reads.filter(x=>!x?.ok);if(failed.length)throw new Error(`authoritative_read_unavailable:${failed.map(x=>x.error||"db_error").join("|")}`);return reads.map(x=>x.value)}
function parseObject(value){
  try{
    const parsed=JSON.parse(String(value||"{}"));
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
  }catch{return {}}
}
function policyDecision(actionKey,auth){
  return evaluateAgentAction({
    agentKey:"thebe",
    actionKey,
    actorRole:String(auth?.role||"").toLowerCase(),
    tenantScoped:true,
    systemActor:auth?.systemActor===true,
    phase:"phase1"
  });
}
function baseResult(actionKey,decision){
  return {
    actionKey,
    sourceRef:SOURCE_REFS[actionKey],
    capability:decision?.action?.capability||"core",
    authoritativeSource:decision?.action?.authoritativeSource||null,
    readOnly:true,
    mutationAllowed:false,
    decisionCode:decision?.code||"unknown",
    policyVersion:decision?.policyVersion||null
  };
}

async function businessHealth(env,tenantId){
  const reads=await Promise.all([
    safeFirst(env,"SELECT COUNT(*) open_count, SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) critical_count, SUM(CASE WHEN severity='warning' THEN 1 ELSE 0 END) warning_count, MAX(created_at) latest_signal_at FROM performance_insights WHERE tenant_id=? AND status IN ('open','acknowledged')",[tenantId]),
    safeFirst(env,"SELECT SUM(CASE WHEN status IN ('queued','pending','retry') THEN 1 ELSE 0 END) pending_count, SUM(CASE WHEN status IN ('failed','dead') THEN 1 ELSE 0 END) failed_count, MIN(CASE WHEN status IN ('queued','pending','retry') THEN due_at END) next_due_at FROM workflow_jobs WHERE tenant_id=?",[tenantId]),
    safeFirst(env,"SELECT SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END) overdue_count, SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP AND due_at<datetime('now','+14 days') THEN 1 ELSE 0 END) due_14d_count FROM compliance_obligations WHERE tenant_id=?",[tenantId])
  ]);const [performance,workflows,compliance]=requireReads(reads);
  return Object.freeze({
    openPerformanceSignals:number(performance?.open_count),
    criticalPerformanceSignals:number(performance?.critical_count),
    warningPerformanceSignals:number(performance?.warning_count),
    latestPerformanceSignalAt:performance?.latest_signal_at||null,
    pendingWorkflowCount:number(workflows?.pending_count),
    failedWorkflowCount:number(workflows?.failed_count),
    nextWorkflowDueAt:workflows?.next_due_at||null,
    overdueComplianceCount:number(compliance?.overdue_count),
    complianceDueWithin14Days:number(compliance?.due_14d_count)
  });
}

async function financialPosition(env,tenantId){
  const reads=await Promise.all([
    safeFirst(env,"SELECT COALESCE(SUM(a.opening_balance_minor+COALESCE(t.net,0)),0) cash_position_minor, COUNT(a.id) account_count FROM finance_accounts a LEFT JOIN (SELECT account_id,SUM(amount_minor) net FROM finance_transactions WHERE tenant_id=? GROUP BY account_id) t ON t.account_id=a.id WHERE a.tenant_id=? AND a.status='active'",[tenantId,tenantId]),
    safeFirst(env,"SELECT COUNT(*) reconciliation_count, SUM(CASE WHEN status='exception' THEN 1 ELSE 0 END) exception_count, COALESCE(SUM(CASE WHEN status='exception' THEN ABS(difference_minor) ELSE 0 END),0) exception_exposure_minor, MAX(created_at) latest_reconciliation_at FROM finance_reconciliation_runs WHERE tenant_id=?",[tenantId]),
    financeReceivablesSummary(env,tenantId).then(value=>({ok:true,value})).catch(error=>({ok:false,error:text(error?.message||error,160)}))
  ]);const [position,reconciliation,receivables]=requireReads(reads);
  return Object.freeze({
    currency:"BWP",
    cashPositionMinor:number(position?.cash_position_minor),
    activeAccountCount:number(position?.account_count),
    reconciliationCount:number(reconciliation?.reconciliation_count),
    reconciliationExceptionCount:number(reconciliation?.exception_count),
    reconciliationExceptionExposureMinor:number(reconciliation?.exception_exposure_minor),
    latestReconciliationAt:reconciliation?.latest_reconciliation_at||null,
    receivablesOutstandingMinor:number(receivables?.outstandingMinor),
    receivablesOverdueMinor:number(receivables?.overdueMinor),
    outstandingInvoiceCount:number(receivables?.outstandingInvoiceCount),
    overdueInvoiceCount:number(receivables?.overdueInvoiceCount)
  });
}

function gaboroneDate(value=new Date()){
  try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(value)}
  catch{return value.toISOString().slice(0,10)}
}

async function financeDailyInflows(env,tenantId,{businessDate=gaboroneDate()}={}){
  return financeDailyCollections(env,tenantId,{businessDate});
}

async function receivablesSummary(env,tenantId){
  return financeReceivablesSummary(env,tenantId);
}

async function receivablesCustomer(env,tenantId,params={}){
  return financeReceivableCustomerLookup(env,tenantId,{customerQuery:params.customerQuery});
}

async function financeDataQuality(env,tenantId){
  const reads=await Promise.all([
    safeFirst(env,"SELECT COUNT(*) import_batch_count, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed_batch_count, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed_batch_count, COALESCE(SUM(row_count),0) imported_row_count, COALESCE(SUM(duplicate_count),0) duplicate_row_count, MAX(completed_at) latest_completed_at FROM finance_import_batches WHERE tenant_id=? AND substr(id,1,2)<>'__'",[tenantId]),
    safeFirst(env,"SELECT COUNT(*) run_count, SUM(CASE WHEN status='reconciled' THEN 1 ELSE 0 END) reconciled_count, SUM(CASE WHEN status='exception' THEN 1 ELSE 0 END) exception_count, MAX(created_at) latest_run_at FROM finance_reconciliation_runs WHERE tenant_id=?",[tenantId]),
    safeFirst(env,"SELECT COUNT(*) transaction_count, SUM(CASE WHEN source_fingerprint IS NULL OR source_fingerprint='' THEN 1 ELSE 0 END) missing_fingerprint_count, MAX(created_at) latest_transaction_at FROM finance_transactions WHERE tenant_id=?",[tenantId])
  ]);const [imports,reconciliations,transactions]=requireReads(reads);
  const importedRows=number(imports?.imported_row_count);
  const duplicateRows=number(imports?.duplicate_row_count);
  const totalRows=importedRows+duplicateRows;
  return Object.freeze({
    importBatchCount:number(imports?.import_batch_count),
    completedImportBatchCount:number(imports?.completed_batch_count),
    failedImportBatchCount:number(imports?.failed_batch_count),
    importedRowCount:importedRows,
    duplicateRowCount:duplicateRows,
    duplicateRate:totalRows>0?duplicateRows/totalRows:null,
    latestImportCompletedAt:imports?.latest_completed_at||null,
    reconciliationRunCount:number(reconciliations?.run_count),
    reconciledRunCount:number(reconciliations?.reconciled_count),
    reconciliationExceptionCount:number(reconciliations?.exception_count),
    latestReconciliationAt:reconciliations?.latest_run_at||null,
    transactionCount:number(transactions?.transaction_count),
    missingSourceFingerprintCount:number(transactions?.missing_fingerprint_count),
    latestTransactionAt:transactions?.latest_transaction_at||null
  });
}

async function complianceStatus(env,tenantId){
  const reads=await Promise.all([
    safeFirst(env,"SELECT COUNT(*) total_count, SUM(CASE WHEN status NOT IN ('completed','closed') THEN 1 ELSE 0 END) open_count, SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at<CURRENT_TIMESTAMP THEN 1 ELSE 0 END) overdue_count, SUM(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP AND due_at<datetime('now','+14 days') THEN 1 ELSE 0 END) due_14d_count, MIN(CASE WHEN status NOT IN ('completed','closed') AND due_at>=CURRENT_TIMESTAMP THEN due_at END) next_due_at FROM compliance_obligations WHERE tenant_id=?",[tenantId]),
    safeAll(env,"SELECT id,title,due_at,status FROM compliance_obligations WHERE tenant_id=? AND status NOT IN ('completed','closed') ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END,due_at ASC,id ASC LIMIT 5",[tenantId])
  ]);const [summary,nextRows]=requireReads(reads);
  return Object.freeze({
    totalObligationCount:number(summary?.total_count),
    openObligationCount:number(summary?.open_count),
    overdueObligationCount:number(summary?.overdue_count),
    dueWithin14Days:number(summary?.due_14d_count),
    nextDueAt:summary?.next_due_at||null,
    nextObligations:Object.freeze((nextRows?.results||[]).map(row=>Object.freeze({
      id:text(row.id,120),
      title:text(row.title,180),
      dueAt:row.due_at||null,
      status:text(row.status,60)
    })))
  });
}

async function dailyOperationsSummary(env,tenantId){
  const rowRead=await safeFirst(env,"SELECT summary_date,generation_mode,metrics_json,created_at FROM daily_operations_summaries WHERE tenant_id=? ORDER BY summary_date DESC,created_at DESC LIMIT 1",[tenantId]);
  const [row]=requireReads([rowRead]);
  if(!row)return Object.freeze({available:false,summaryDate:null,generationMode:null,metrics:Object.freeze({})});
  const metrics=parseObject(row.metrics_json);
  const allowed={};
  for(const key of ["coverage","reportedRevenue","revenue","customers","orders","jobsCompleted","jobsPending","exceptions","locationsReporting","locationCount","headcountReported"]){
    const value=metrics[key];
    if(typeof value==="number"&&Number.isFinite(value))allowed[key]=value;
  }
  return Object.freeze({
    available:true,
    summaryDate:row.summary_date||null,
    generationMode:text(row.generation_mode,80)||null,
    metrics:Object.freeze(allowed),
    narrativeExcluded:true
  });
}

async function executeOne(actionKey,{env,auth,params={}}){
  const decision=policyDecision(actionKey,auth);
  const result=baseResult(actionKey,decision);
  if(decision.allowed!==true)return Object.freeze({...result,available:false,allowed:false,error:decision.code});
  let data;
  try{
  if(actionKey==="business_health.read")data=await businessHealth(env,auth.tenant_id);
  else if(actionKey==="financial_position.read")data=await financialPosition(env,auth.tenant_id);
  else if(actionKey==="finance_data_quality.read")data=await financeDataQuality(env,auth.tenant_id);
  else if(actionKey==="finance_daily_inflows.read")data=await financeDailyInflows(env,auth.tenant_id);
  else if(actionKey==="receivables_summary.read")data=await receivablesSummary(env,auth.tenant_id);
  else if(actionKey==="receivables_customer.read")data=await receivablesCustomer(env,auth.tenant_id,params);
  else if(actionKey==="compliance_status.read")data=await complianceStatus(env,auth.tenant_id);
  else if(actionKey==="daily_operations_summary.read")data=await dailyOperationsSummary(env,auth.tenant_id);
  else return Object.freeze({...result,available:false,allowed:false,error:"unsupported_read_tool"});
  }catch(error){return Object.freeze({...result,available:false,allowed:true,error:"authoritative_read_unavailable",errorDetail:text(error?.message||error,160)});}
  return Object.freeze({...result,available:true,allowed:true,data});
}

export async function executeAgentReadTool(actionKey,context={}){
  const key=String(actionKey||"").trim();
  if(!SUPPORTED_TOOL_ACTIONS.includes(key)){
    return Object.freeze({actionKey:key,available:false,allowed:false,readOnly:true,mutationAllowed:false,error:"unsupported_read_tool"});
  }
  return executeOne(key,context);
}

export async function buildAgentReadToolContext({env,auth}={}){
  const results=await Promise.all(TOOL_ACTIONS.map(actionKey=>executeOne(actionKey,{env,auth})));
  const allowed=results.filter(item=>item.allowed===true&&item.available===true);
  return Object.freeze({
    version:AGENT_READ_TOOLS_VERSION,
    architecture:"single_agent",
    agentKey:"thebe",
    readOnly:true,
    mutationAllowed:false,
    toolCount:allowed.length,
    sourceRefs:Object.freeze(allowed.map(item=>item.sourceRef)),
    tools:Object.freeze(results)
  });
}

export const __agentReadToolsTest=Object.freeze({TOOL_ACTIONS,PARAMETERIZED_TOOL_ACTIONS,SUPPORTED_TOOL_ACTIONS,SOURCE_REFS,parseObject});
