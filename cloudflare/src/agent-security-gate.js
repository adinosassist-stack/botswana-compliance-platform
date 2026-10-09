import {evaluateToolTrust} from "./agent-tool-trust-registry.js";
// Fail-closed preflight for Thebe persistent-task capability declarations.
// This module is pure and has no network or database side effects.
export const AGENT_SECURITY_GATE_VERSION = "2026-10-09.v3";

export function evaluateAgentAction({tool,allowedTools=[],tenantId,taskTenantId,taskStatus="active",suspended=false,externalDestination=false,policyViolation=false}={}){
  const deny=(reason)=>Object.freeze({allowed:false,executionAllowed:false,reason,requiresOwnerApproval:false});
  if(typeof tenantId!=="string"||!tenantId.trim()||tenantId!==tenantId.trim()||typeof taskTenantId!=="string"||!taskTenantId.trim()||taskTenantId!==taskTenantId.trim()||tenantId!==taskTenantId)return deny("tenant_boundary");
  if(suspended!==false||taskStatus!=="active")return deny("responsibility_inactive");
  if(policyViolation!==false)return deny("policy_violation");
  if(typeof tool!=="string"||!tool.trim()||tool!==tool.trim()||tool.length>120||!Array.isArray(allowedTools)||!allowedTools.includes(tool))return deny("tool_not_authorized");
  // Owner approval, if supplied by a caller, cannot elevate untrusted tools.
  if(externalDestination!==false)return deny("external_destination_denied");
  let trust;
  try{trust=evaluateToolTrust({actionKey:tool,destination:"internal"});}
  catch{return deny("trust_evaluation_failed");}
  if(!trust||trust.allowed!==true||trust.executionAllowed!==false)return deny(trust?.code||"trust_evaluation_failed");
  // Eligibility is a preflight result, never permission to execute a tool.
  return Object.freeze({allowed:true,executionAllowed:false,reason:"preflight_eligible",requiresOwnerApproval:false});
}
