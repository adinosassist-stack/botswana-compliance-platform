import {createPostgresAgentApprovalHistoryReader} from "./agent-approval-history-postgres.js";
import {readAuthenticatedAgentApprovalHistory} from "../cloudflare/src/agent-approval-history-service.js";

// Explicit composition boundary. Not mounted on any HTTP route.
// The trusted principal must be built by existing authenticated server middleware.
// This controller does not parse client-supplied identity or authorization flags.
export async function getAgentApprovalHistoryForPrincipal({
 principal,pool,featureEnabled=false,killSwitch=false,limit=20
}={}){
 const deny=code=>Object.freeze({ok:false,code,items:Object.freeze([]),readOnly:true});
 if(featureEnabled!==true||killSwitch!==false)return deny("agent_history_disabled");
 if(!principal||principal.authenticated!==true||typeof principal.tenantId!=="string"||!principal.tenantId.trim()||
 typeof principal.actorId!=="string"||!principal.actorId.trim()||
 !["owner","manager"].includes(principal.actorRole))return deny("unauthenticated");
 if(!Number.isInteger(limit)||limit<1||limit>50)return deny("invalid_input");
 try{
  const store=createPostgresAgentApprovalHistoryReader(pool);
  return await readAuthenticatedAgentApprovalHistory({principal,store,featureEnabled,killSwitch,limit});
 }catch{return deny("history_unavailable");}
}
