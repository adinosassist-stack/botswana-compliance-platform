// Integration seam only: deliberately NOT registered in the Cloudflare router.
// Explicit staging environment + feature switch + trusted server resolver required.
import {conversationStagingBoundary} from "./conversation-staging-boundary-rehearsal.js";
const fail=(status,error)=>({status,body:{ok:false,error}});
export async function conversationStagingGateway({env,request,threadId,resolveAuthenticatedContext,id}={}){
 if(env?.DEPLOYMENT_ENV!=="staging"||env?.CONVERSATION_HISTORY_STAGING_ENABLED!=="true")
   return fail(404,"not_found");
 if(typeof resolveAuthenticatedContext!=="function")return fail(503,"auth_resolver_unavailable");
 if(typeof threadId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(threadId))
   return fail(400,"invalid_thread");
 let context;
 try{context=await resolveAuthenticatedContext({request,threadId,env})}
 catch{return fail(401,"unauthenticated")}
 if(!context?.session?.authenticated||context?.session?.active!==true)
   return fail(401,"unauthenticated");
 if(context?.session?.tenantId!==context?.conversation?.tenantId||
    context?.session?.userId!==context?.workspaceMembership?.userId||
    context?.session?.tenantId!==context?.workspaceMembership?.tenantId||
    context?.workspaceMembership?.conversationId!==threadId)
   return fail(403,"access_denied");
 return conversationStagingBoundary({env,request,context,threadId,id});
}
