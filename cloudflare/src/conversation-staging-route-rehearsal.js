// Isolated route dispatcher for a future dedicated conversation staging Worker.
// Not imported by production-entry or any deployed staging entry.
import {conversationStagingGateway} from "./conversation-staging-gateway-rehearsal.js";
const fail=(status,error)=>Response.json({ok:false,error},{status,headers:{"cache-control":"no-store"}});
export function createConversationStagingRoute(resolveAuthenticatedContext){
 return {
  async fetch(request,env){
   let url;
   try{url=new URL(request.url)}catch{return fail(400,"invalid_url")}
   if(env?.APP_ENV!=="staging"||env?.DEPLOYMENT_PROFILE!=="conversation-staging"||
      env?.DEPLOYMENT_ENV!=="staging"||env?.CONVERSATION_HISTORY_STAGING_ENABLED!=="true")
      return fail(404,"not_found");
   // No wildcard or production host matching. Exact origin must be set by deploy operator.
   if(!env.CONVERSATION_STAGING_ORIGIN||url.origin!==env.CONVERSATION_STAGING_ORIGIN)
      return fail(403,"origin_mismatch");
   const match=/^\/api\/conversation-staging\/threads\/([A-Za-z0-9_-]{1,128})\/messages$/.exec(url.pathname);
   if(!match)return fail(404,"not_found");
   if(!["GET","POST"].includes(request.method))return fail(405,"method_not_allowed");
   // Do not trust a binding alias or configured UUID alone: a provisioned
   // marker inside the isolated D1 must match the known staging identity.
   const stagingId="95c48030-0395-44cb-aa95-622beaf4efdf";
   if(env.CONVERSATION_STAGING_D1_ID!==stagingId||!env.DB?.prepare)
      return fail(503,"staging_database_identity_required");
   try{
     const marker=await env.DB.prepare("SELECT COUNT(*) AS marker_count, MIN(database_uuid) AS database_uuid FROM thebe_conversation_staging_identity").first();
     if(Number(marker?.marker_count)!==1||marker?.database_uuid!==stagingId)return fail(503,"staging_database_identity_required");
   }catch{return fail(503,"staging_database_identity_required")}
   const result=await conversationStagingGateway({
     request,env,threadId:match[1],resolveAuthenticatedContext
   });
   return Response.json(result.body,{status:result.status,headers:{"cache-control":"no-store","x-robots-tag":"noindex, nofollow"}});
  }
 };
}
