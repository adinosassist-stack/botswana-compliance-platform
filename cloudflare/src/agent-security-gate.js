import {evaluateToolTrust} from "./agent-tool-trust-registry.js";
// Fail-closed policy gate for Thebe agent tool execution.
// This module is pure and has no network or database side effects.
export const AGENT_SECURITY_GATE_VERSION = "2026-10-09.v1";

export function evaluateAgentAction({tool,allowedTools=[],approval=null,tenantId,taskTenantId,taskStatus="active",suspended=false,externalDestination=false,policyViolation=false}={}){
  const deny=(reason)=>({allowed:false,executionAllowed:false,reason,requiresOwnerApproval:false});
  if(typeof tenantId!=="string"||!tenantId.trim()||typeof taskTenantId!=="string"||tenantId!==taskTenantId)return deny("tenant_boundary");
  if(suspended||taskStatus!=="active")return deny("responsibility_inactive");
  if(policyViolation)return deny("policy_violation");
  if(typeof tool!=="string"||!Array.isArray(allowedTools)||!allowedTools.includes(tool))return deny("tool_not_authorized");
  // No approval token can elevate a tool absent from the trusted read-only registry.
  const trust=evaluateToolTrust({actionKey:tool,destination:externalDestination?"external":"internal"});
  if(!trust.allowed)return deny(trust.code);
  // Eligibility is a preflight result, never permission to execute a tool.
  return {allowed:true,executionAllowed:false,reason:"preflight_eligible",requiresOwnerApproval:false};
}
