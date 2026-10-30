// Explicitly UNWIRED staging harness. No production Worker imports this module.
// The session verifier must be the existing, audited server authentication path.
import {createConversationStagingContextResolver} from "./conversation-staging-context-resolver-rehearsal.js";
import {createConversationStagingRoute} from "./conversation-staging-route-rehearsal.js";

export function createConversationStagingIntegration({verifyCurrentSession}={}){
 if(typeof verifyCurrentSession!=="function")throw new TypeError("server_session_verifier_required");
 const readSession=async({request,env})=>{
   const session=await verifyCurrentSession({request,env});
   if(!session||session.authenticated!==true||session.active!==true)return null;
   // Only the verifier may provide csrfVerified; a request header alone is not proof.
   return session;
 };
 const readMembership=async({env,tenantId,userId,threadId})=>{
   if(!env?.DB?.prepare)return null;
   const row=await env.DB.prepare(
     "SELECT tenant_id,conversation_id,user_id,role,active FROM thebe_conversation_members_rehearsal WHERE tenant_id=? AND conversation_id=? AND user_id=? LIMIT 1"
   ).bind(tenantId,threadId,userId).first();
   if(!row)return null;
   return {tenantId:row.tenant_id,conversationId:row.conversation_id,userId:row.user_id,role:row.role,active:row.active===1};
 };
 const readConversation=async({env,tenantId,threadId})=>{
   if(!env?.DB?.prepare)return null;
   const row=await env.DB.prepare(
     "SELECT tenant_id,id,status FROM thebe_conversations_rehearsal WHERE tenant_id=? AND id=? LIMIT 1"
   ).bind(tenantId,threadId).first();
   return row?{tenantId:row.tenant_id,id:row.id,status:row.status}:null;
 };
 const resolver=createConversationStagingContextResolver({readSession,readMembership,readConversation});
 return createConversationStagingRoute(resolver);
}
