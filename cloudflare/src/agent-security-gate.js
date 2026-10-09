import {evaluateToolTrust} from "./agent-tool-trust-registry.js";
// Fail-closed policy gate for Thebe agent tool execution.
// This module is pure and has no network or database side effects.
export const AGENT_SECURITY_GATE_VERSION = "2026-10-09.v1";
const HIGH_RISK = new Set(["payment.execute","government_filing.submit","records.delete","external_message.send","credentials.read","permissions.write"]);
export function evaluateAgentAction({tool,allowedTools=[],approval=null,tenantId,taskTenantId,taskStatus="active",suspended=false,externalDestination=false,policyViolation=false}={}){
  const deny=(reason)=>({allowed:false,reason,requiresOwnerApproval:false});
  if(!tenantId||!taskTenantId||tenantId!==taskTenantId)return deny("tenant_boundary");
  if(suspended||taskStatus!=="active")return deny("responsibility_inactive");
  if(policyViolation)return deny("policy_violation");
  if(typeof tool!=="string"||!allowedTools.includes(tool))return deny("tool_not_authorized");
  // No approval token can elevate a tool absent from the trusted read-only registry.
  const trust=evaluateToolTrust({actionKey:tool,destination:externalDestination?"external":"internal"});
  if(!trust.allowed)return deny(trust.code);
  const consequential=HIGH_RISK.has(tool)||externalDestination;
  if(consequential && !(approval?.ownerApproved===true && approval?.tenantId===tenantId && approval?.tool===tool && approval?.expiresAt && Date.parse(approval.expiresAt)>Date.now())){
    return {allowed:false,reason:"owner_approval_required",requiresOwnerApproval:true};
  }
  return {allowed:true,reason:"authorized",requiresOwnerApproval:false};
}
