import {authorizeOwnerAssistantRead} from "./owner-chatgpt-read-gate.js";
import {executeAgentReadTool} from "./agent-read-tools.js";

// Internal adapter only: not mounted on HTTP, MCP, or a public Worker route.
// Requires a server-verified identity and explicit feature enablement.
export async function runOwnerChatgptRead({env,verifiedIdentity,actionKey,tenantId}={}) {
  const gate=authorizeOwnerAssistantRead({
    enabled:env?.OWNER_CHATGPT_PRIVATE_READ_ENABLED==="1",
    identity:verifiedIdentity,actionKey,tenantId
  });
  if(!gate.allowed)return Object.freeze({allowed:false,available:false,executionAllowed:false,error:gate.code});
  // Deliberately do not return raw business data to an external model.
  // Separate reviewed redaction, consent and egress authorization are required.
  const result=await executeAgentReadTool(actionKey,{env,auth:{role:"owner",tenant_id:tenantId}});
  if(result?.allowed!==true || result?.available!==true)
    return Object.freeze({allowed:false,available:false,executionAllowed:false,error:"authoritative_read_unavailable"});
  return Object.freeze({allowed:true,available:true,executionAllowed:false,readOnly:true,
    actionKey,sourceRef:result.sourceRef,policyVersion:result.policyVersion,
    externalDisclosureAllowed:false,dataWithheld:true});
}
