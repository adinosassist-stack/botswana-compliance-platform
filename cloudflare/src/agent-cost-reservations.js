// Durable budget reservations; never grant execution authority by themselves.
// Call reserve only after the existing runtime guard and owner authority checks pass.
import {evaluateAgentCostAdmission} from "./agent-cost-admission.js";
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export async function reserveAgentCost(env,{tenantId,actorTenantId,agentId,runId,reservationId,estimatedCostMinor}={}){
 if(!env?.DB||!tenantId||!agentId||!runId||!reservationId||!valid(estimatedCostMinor))return {allowed:false,code:"cost_reservation_invalid"};
 const budget=await env.DB.prepare("SELECT * FROM agent_cost_budgets WHERE tenant_id=? AND agent_id=?").bind(tenantId,agentId).first();
 if(!budget)return {allowed:false,code:"cost_budget_missing"};
 const decision=evaluateAgentCostAdmission({tenantId,actorTenantId,agentId,estimatedCostMinor,spentMinor:Number(budget.spent_minor)+Number(budget.reserved_minor),budgetMinor:Number(budget.budget_minor),enabled:Number(budget.enabled)===1,suspended:Number(budget.suspended)===1,usageKnown:true});
 if(!decision.allowed)return decision;
 // SQLite D1 batch is transactional; conditional UPDATE is the authoritative admission gate.
 // changes() ties insertion to successful reservation; conflicts roll back the batch.
 try{
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE agent_cost_budgets SET reserved_minor=reserved_minor+?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND agent_id=? AND enabled=1 AND suspended=0 AND spent_minor+reserved_minor+?<=budget_minor").bind(estimatedCostMinor,tenantId,agentId,estimatedCostMinor),
   env.DB.prepare("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor,status) SELECT ?,?,?,?,?,'reserved' WHERE changes()=1").bind(reservationId,tenantId,agentId,runId,estimatedCostMinor)
  ]);
  if(Number(results?.[0]?.meta?.changes??0)!==1||Number(results?.[1]?.meta?.changes??0)!==1)return {allowed:false,code:"cost_reservation_conflict"};
  return {allowed:true,code:"cost_reserved",reservationId};
 }catch{return {allowed:false,code:"cost_reservation_conflict"}}
}
// Settlement is intentionally withheld until over-estimate handling and audit
// reconciliation are implemented; reservations cannot silently become spend.
