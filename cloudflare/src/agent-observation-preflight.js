import {evaluateToolTrust, trustedToolDefinition} from "./agent-tool-trust-registry.js";
import {selectAgentModel} from "./agent-model-router-policy.js";

// Read-only policy preflight. It never executes a tool or grants authority.
export function preflightAgentObservation(input={}){
  if(!input||typeof input!=="object"||Array.isArray(input))return {ok:false,reason:"invalid_input",executionAllowed:false};
  const {tenantId,actorId,actionKey,taskClass,models,budgetUsd,requiredRegion=null,payloadBytes=0}=input;
  if(typeof tenantId!=="string"||!tenantId.trim()||typeof actorId!=="string"||!actorId.trim())
    return {ok:false,reason:"missing_authority_context",executionAllowed:false};
  if(!Number.isSafeInteger(payloadBytes)||payloadBytes<0)
    return {ok:false,reason:"invalid_payload_size",executionAllowed:false};
  const tool=trustedToolDefinition(actionKey);
  if(!tool)return {ok:false,reason:"tool_not_trusted",executionAllowed:false};
  const trust=evaluateToolTrust({actionKey,requestedToolId:tool.toolId,requestedTransport:"internal",destination:"internal",payloadBytes});
  if(trust.allowed!==true||trust.executionAllowed!==false)return {ok:false,reason:trust.code,executionAllowed:false};
  const route=selectAgentModel({taskClass,models,budgetUsd,requiredRegion});
  if(!route.ok)return {ok:false,reason:route.reason,executionAllowed:false};
  return {ok:true,tenantId:tenantId.trim(),actorId:actorId.trim(),actionKey,modelId:route.modelId,estimatedCostUsd:route.estimatedCostUsd,executionAllowed:false,requiresRuntimeGuard:true};
}
