// Unregistered staging-only integration with Thebe's existing session verifier.
// Must deploy only with an independently isolated staging D1 and approved policy.
import {authenticateWorkspaceSession} from "./worker.js";
import {createConversationStagingIntegration} from "./conversation-staging-integration-rehearsal.js";

function sameToken(a,b){
 const left=new TextEncoder().encode(String(a||""));
 const right=new TextEncoder().encode(String(b||""));
 if(!left.length||!right.length||left.length!==right.length)return false;
 let different=0;
 for(let i=0;i<left.length;i++)different|=left[i]^right[i];
 return different===0;
}
export function createConversationStagingAuthenticatedEntry(authenticate=authenticateWorkspaceSession){
 if(typeof authenticate!=="function")throw new TypeError("server_authentication_required");
 return createConversationStagingIntegration({
  verifyCurrentSession:async({request,env})=>{
   if(env?.APP_ENV!=="staging"||env?.DEPLOYMENT_PROFILE!=="conversation-staging"||
      env?.DEPLOYMENT_ENV!=="staging"||env?.CONVERSATION_HISTORY_STAGING_ENABLED!=="true")
      return null;
   // The exported core authenticator verifies signed session token against D1,
   // expiry, generation, active workspace membership and selected tenant.
   const row=await authenticate(request,env);
   if(!row?.user_id||!row?.tenant_id)return null;
   const provided=request.headers.get("x-csrf-token");
   return {authenticated:true,active:true,userId:row.user_id,tenantId:row.tenant_id,
     csrfVerified:request.method==="GET"||sameToken(provided,row.csrf_token)};
  }
 });
}
