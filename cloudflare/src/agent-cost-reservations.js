// Durable budget reservations; never grant execution authority by themselves.
// Call reserve only after the existing runtime guard and owner authority checks pass.
import {evaluateAgentCostAdmission} from "./agent-cost-admission.js";
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export async function reserveAgentCost(env,{tenantId,actorTenantId,agentId,runId,reservationId,estimatedCostMinor}={}){
 if(!env?.DB||!tenantId||tenantId!==actorTenantId||!agentId||!runId||!reservationId||!valid(estimatedCostMinor))return {allowed:false,code:"cost_reservation_invalid"};
 const budget=await env.DB.prepare("SELECT * FROM agent_cost_budgets WHERE tenant_id=? AND agent_id=?").bind(tenantId,agentId).first();
 if(!budget)return {allowed:false,code:"cost_budget_missing"};
 if(![budget.spent_minor,budget.reserved_minor,budget.budget_minor].every(value=>valid(Number(value))))return {allowed:false,code:"cost_budget_invalid"};
 const decision=evaluateAgentCostAdmission({tenantId,actorTenantId,agentId,estimatedCostMinor,spentMinor:Number(budget.spent_minor)+Number(budget.reserved_minor),budgetMinor:Number(budget.budget_minor),enabled:Number(budget.enabled)===1,suspended:Number(budget.suspended)===1,usageKnown:true});
 if(!decision.allowed)return decision;
 // SQLite D1 batch is transactional; conditional UPDATE is the authoritative admission gate.
 // changes() ties insertion to successful reservation; conflicts roll back the batch.
 try{
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE agent_cost_budgets SET reserved_minor=reserved_minor+?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND agent_id=? AND enabled=1 AND suspended=0 AND spent_minor+reserved_minor+?<=budget_minor").bind(estimatedCostMinor,tenantId,agentId,estimatedCostMinor),
   env.DB.prepare("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor,status) SELECT ?,?,?,?,?,'reserved' WHERE changes()=1").bind(reservationId,tenantId,agentId,runId,estimatedCostMinor),
   env.DB.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) SELECT ?,?,? ,'reserved',? WHERE changes()=1").bind(reservationId,tenantId,agentId,estimatedCostMinor)
  ]);
  if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1||Number(results?.[2]?.meta?.changes??0)!==1)return {allowed:false,code:"cost_reservation_conflict"};
  return {allowed:true,code:"cost_reserved",reservationId};
 }catch{return {allowed:false,code:"cost_reservation_conflict"}}
}

/**
 * Settle an existing reservation using verified provider usage.
 * Actual charges above the estimate are rejected unless sufficient unreserved
 * budget remains. Unknown usage must remain reserved for reconciliation.
 */
export async function settleAgentCost(env,{tenantId,actorTenantId,agentId,reservationId,actualCostMinor,provider,model,inputTokens,outputTokens}={}){
 if(!env?.DB||!tenantId||tenantId!==actorTenantId||!agentId||!reservationId||
    ![actualCostMinor,inputTokens,outputTokens].every(valid)||
    typeof provider!=="string"||!provider.trim()||typeof model!=="string"||!model.trim()){
   return {allowed:false,code:"cost_settlement_invalid"};
 }
 try{
  const row=await env.DB.prepare("SELECT estimate_minor,status FROM agent_cost_reservations WHERE id=? AND tenant_id=? AND agent_id=?").bind(reservationId,tenantId,agentId).first();
  if(!row||row.status!=="reserved"||!valid(Number(row.estimate_minor)))return {allowed:false,code:"cost_reservation_not_active"};
  const estimate=Number(row.estimate_minor);
  // D1 batch executes transactionally. UPDATE + changes()-gated UPDATE
  // makes the reservation transition a single-use compare-and-swap.
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE agent_cost_reservations SET status='settled',actual_minor=?,provider=?,model=?,input_tokens=?,output_tokens=?,settled_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND agent_id=? AND status='reserved' AND estimate_minor=? AND EXISTS (SELECT 1 FROM agent_cost_budgets WHERE tenant_id=? AND agent_id=? AND reserved_minor>=? AND spent_minor+reserved_minor+?-?<=budget_minor)").bind(actualCostMinor,provider.trim().slice(0,100),model.trim().slice(0,100),inputTokens,outputTokens,reservationId,tenantId,agentId,estimate,tenantId,agentId,estimate,actualCostMinor,estimate),
   env.DB.prepare("UPDATE agent_cost_budgets SET reserved_minor=reserved_minor-?,spent_minor=spent_minor+?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND agent_id=? AND changes()=1").bind(estimate,actualCostMinor,tenantId,agentId),
   env.DB.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor,actual_minor) SELECT ?,?,?,'settled',?,? WHERE changes()=1").bind(reservationId,tenantId,agentId,estimate,actualCostMinor)
  ]);
  if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1||Number(results?.[2]?.meta?.changes??0)!==1)return {allowed:false,code:"cost_settlement_conflict"};
  return {allowed:true,code:"cost_settled",reservationId,actualCostMinor};
 }catch{return {allowed:false,code:"cost_settlement_conflict"}}
}
export async function releaseAgentCost(env,{tenantId,actorTenantId,agentId,reservationId}={}){
 if(!env?.DB||!tenantId||tenantId!==actorTenantId||!agentId||!reservationId)return {allowed:false,code:"cost_release_invalid"};
 try{
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE agent_cost_reservations SET status='released',settled_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND agent_id=? AND status='reserved'").bind(reservationId,tenantId,agentId),
   env.DB.prepare("UPDATE agent_cost_budgets SET reserved_minor=reserved_minor-(SELECT estimate_minor FROM agent_cost_reservations WHERE id=? AND tenant_id=? AND agent_id=?),updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND agent_id=? AND changes()=1").bind(reservationId,tenantId,agentId,tenantId,agentId),
   env.DB.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) SELECT id,tenant_id,agent_id,'released',estimate_minor FROM agent_cost_reservations WHERE id=? AND tenant_id=? AND agent_id=? AND changes()=1").bind(reservationId,tenantId,agentId)
  ]);
  if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1||Number(results?.[2]?.meta?.changes??0)!==1)return {allowed:false,code:"cost_release_conflict"};
  return {allowed:true,code:"cost_released",reservationId};
 }catch{return {allowed:false,code:"cost_release_conflict"}}
}
