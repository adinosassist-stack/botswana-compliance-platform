// Experimental orchestration boundary: never reserve unless the deterministic
// runtime guard explicitly authorizes execution. Does not enable live execution.
import {evaluateAgentRuntimeGuard} from "./agent-runtime-guard.js";
import {reserveAgentCost} from "./agent-cost-reservations.js";

export async function authorizeAndReserveAgentCost(env,{guardInput,reservationInput}={}){
 if(!guardInput||!reservationInput||typeof guardInput!=="object"||typeof reservationInput!=="object")return {allowed:false,executionAllowed:false,code:"cost_boundary_invalid"};
 const decision=evaluateAgentRuntimeGuard(guardInput);
 if(decision.allowed!==true||decision.executionAllowed!==true){
  return {allowed:false,executionAllowed:false,code:decision.code,guard:decision};
 }
 const tenantId=String(guardInput.tenantId||"").trim();
 const actorTenantId=String(guardInput.actorTenantId||"").trim();
 const targetTenantId=String(guardInput.targetTenantId||"").trim();
 if(!tenantId||tenantId!==actorTenantId||tenantId!==targetTenantId||
    reservationInput.tenantId!==tenantId||reservationInput.actorTenantId!==tenantId||
    !reservationInput.agentId||reservationInput.agentId!==String(guardInput.agentKey||"thebe")||
    guardInput.costAdmission===null||!guardInput.costAdmission||
    guardInput.costAdmission.tenantId!==tenantId||
    guardInput.costAdmission.actorTenantId!==tenantId||
    guardInput.costAdmission.agentId!==reservationInput.agentId||
    guardInput.costAdmission.estimatedCostMinor!==reservationInput.estimatedCostMinor){
  return {allowed:false,executionAllowed:false,code:"cost_boundary_identity_mismatch"};
 }
 const reserved=await reserveAgentCost(env,reservationInput);
 if(reserved.allowed!==true)return {...reserved,executionAllowed:false};
 return {...reserved,executionAllowed:true,guard:decision};
}
