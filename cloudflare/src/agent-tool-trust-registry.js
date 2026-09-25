import {AGENT_ACTION_CATALOG} from "./agent-policy.js";

export const TOOL_TRUST_REGISTRY_VERSION="2026-09-25.v1";

const TRUSTED_READ_TOOLS=Object.freeze({
  "business_health.read":{toolId:"thebe.business_health",owner:"thebe",transport:"internal",dataClass:"business_aggregate"},
  "financial_position.read":{toolId:"thebe.financial_position",owner:"thebe",transport:"internal",dataClass:"finance"},
  "finance_data_quality.read":{toolId:"thebe.finance_data_quality",owner:"thebe",transport:"internal",dataClass:"finance"},
  "finance_daily_inflows.read":{toolId:"thebe.finance_daily_inflows",owner:"thebe",transport:"internal",dataClass:"finance"},
  "receivables_summary.read":{toolId:"thebe.receivables_summary",owner:"thebe",transport:"internal",dataClass:"finance"},
  "receivables_customer.read":{toolId:"thebe.receivables_customer",owner:"thebe",transport:"internal",dataClass:"finance"},
  "compliance_status.read":{toolId:"thebe.compliance_status",owner:"thebe",transport:"internal",dataClass:"compliance"},
  "daily_operations_summary.read":{toolId:"thebe.daily_operations_summary",owner:"thebe",transport:"internal",dataClass:"workforce_aggregate"}
});

function frozen(value){return Object.freeze(value)}
function clean(value,max=160){return String(value??"").trim().slice(0,max)}

export function trustedToolDefinition(actionKey){
  const key=clean(actionKey,120);
  const action=Object.prototype.hasOwnProperty.call(AGENT_ACTION_CATALOG,key)?AGENT_ACTION_CATALOG[key]:null;
  const registry=Object.prototype.hasOwnProperty.call(TRUSTED_READ_TOOLS,key)?TRUSTED_READ_TOOLS[key]:null;
  if(!action||!registry)return null;
  return frozen({
    actionKey:key,
    toolId:registry.toolId,
    owner:registry.owner,
    transport:registry.transport,
    dataClass:registry.dataClass,
    capability:action.capability,
    level:action.level,
    externalSideEffect:Boolean(action.externalSideEffect),
    phase1Enabled:Boolean(action.phase1Enabled),
    trustState:"trusted",
    discoveryAuthority:"none",
    executionAuthority:"none",
    networkDestinations:frozen([]),
    pinned:true,
    version:TOOL_TRUST_REGISTRY_VERSION
  });
}

export function evaluateToolTrust({actionKey,requestedToolId=null,requestedTransport=null}={}){
  const definition=trustedToolDefinition(actionKey);
  if(!definition)return frozen({allowed:false,executionAllowed:false,code:"tool_not_trusted",reason:"The requested capability is not in the pinned Tool Trust Registry.",registryVersion:TOOL_TRUST_REGISTRY_VERSION});
  if(requestedToolId&&clean(requestedToolId)!==definition.toolId)return frozen({allowed:false,executionAllowed:false,code:"tool_identity_mismatch",reason:"The requested tool identity does not match the trusted registry entry.",registryVersion:TOOL_TRUST_REGISTRY_VERSION});
  if(requestedTransport&&clean(requestedTransport)!==definition.transport)return frozen({allowed:false,executionAllowed:false,code:"tool_transport_mismatch",reason:"The requested transport does not match the trusted registry entry.",registryVersion:TOOL_TRUST_REGISTRY_VERSION});
  if(definition.externalSideEffect)return frozen({allowed:false,executionAllowed:false,code:"side_effect_tool_not_read_trusted",reason:"The read-only registry cannot authorize a side-effecting tool.",registryVersion:TOOL_TRUST_REGISTRY_VERSION});
  return frozen({allowed:true,executionAllowed:false,code:"trusted_read_tool",reason:"Pinned internal read capability is trusted for governed observation only.",registryVersion:TOOL_TRUST_REGISTRY_VERSION,tool:definition});
}

export function validatePersistentTaskAllowedTools(values=[]){
  if(!Array.isArray(values))return frozen({valid:false,code:"invalid_allowed_tools",tools:frozen([])});
  const tools=[];
  for(const value of values){
    const definition=trustedToolDefinition(value);
    if(!definition)return frozen({valid:false,code:"untrusted_allowed_tool",tools:frozen([])});
    tools.push(definition.actionKey);
  }
  return frozen({valid:true,code:"trusted_allowed_tools",tools:frozen([...new Set(tools)])});
}

export const __toolTrustRegistryTest=frozen({TRUSTED_READ_TOOLS});
