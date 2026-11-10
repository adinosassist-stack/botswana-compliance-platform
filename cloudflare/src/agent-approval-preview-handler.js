import {prepareAgentApprovalPreview} from "./agent-approval-preview-boundary.js";

// Integration seam for an existing authenticated route. Never derives identity
// from the HTTP payload, and never creates an HTTP route or executes an action.
export function handleAuthenticatedAgentPreview({principal,body,featureEnabled=false,killSwitch=false}={}){
 const deny=code=>Object.freeze({ok:false,code,executionAllowed:false,sideEffects:false});
 if(featureEnabled!==true||killSwitch!==false)return deny("agent_preview_disabled");
 if(!principal||typeof principal!=="object"||Array.isArray(principal))return deny("unauthenticated");
 if(principal.authenticated!==true)return deny("unauthenticated");
 if(principal.tenantId==null||principal.actorId==null||principal.actorRole==null)return deny("invalid_principal");
 // The caller must enforce session verification, CSRF, origin, rate limits and
 // tenant membership before invoking this adapter.
 return prepareAgentApprovalPreview({identity:{
  tenantId:principal.tenantId,actorId:principal.actorId,actorRole:principal.actorRole
 },request:body});
}
