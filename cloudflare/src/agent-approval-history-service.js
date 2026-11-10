import {projectAgentApprovalHistory} from "./agent-approval-history-view.js";

// Read-only adapter. The caller MUST provide a server-verified principal and
// tenant-scoped storage adapter; this module does not expose an HTTP route.
export async function readAuthenticatedAgentApprovalHistory({principal,store,featureEnabled=false,killSwitch=false,limit=20}={}){
 const deny=code=>Object.freeze({ok:false,code,items:Object.freeze([]),readOnly:true});
 if(featureEnabled!==true||killSwitch!==false)return deny("agent_history_disabled");
 if(!principal||principal.authenticated!==true||typeof principal.tenantId!=="string"||!principal.tenantId.trim()||typeof principal.actorId!=="string"||!principal.actorId.trim()||!["owner","manager"].includes(principal.actorRole))return deny("unauthenticated");
 if(!Number.isInteger(limit)||limit<1||limit>50||!store||typeof store.listTenantApprovals!=="function")return deny("invalid_input");
 try{
  // The adapter MUST filter by tenant in storage; the projection independently
  // filters again to protect against an accidentally unscoped query.
  const records=await store.listTenantApprovals({tenantId:principal.tenantId,limit:Math.min(limit,50),actorId:principal.actorRole==="manager"?principal.actorId:undefined});
  return projectAgentApprovalHistory({principal,records,limit});
 }catch{return deny("history_unavailable");}
}
