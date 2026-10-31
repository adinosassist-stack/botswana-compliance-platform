// Unwired staging-only composition. Server callbacks must resolve real session,
// membership and conversation records; never accept identities from request JSON.
export function createConversationStagingContextResolver({readSession,readMembership,readConversation}={}){
 if([readSession,readMembership,readConversation].some(f=>typeof f!=="function"))
   throw new TypeError("trusted_server_resolvers_required");
 return async function resolveAuthenticatedContext({request,threadId,env}={}){
   if(!request||!env||!threadId)throw Error("unauthenticated");
   const session=await readSession({request,env});
   if(!session||session.authenticated!==true||session.active!==true||
      typeof session.userId!=="string"||!session.userId||
      typeof session.tenantId!=="string"||!session.tenantId)
     throw Error("unauthenticated");
   const membership=await readMembership({env,userId:session.userId,tenantId:session.tenantId,threadId});
   if(!membership||membership.active!==true||
      membership.userId!==session.userId||membership.tenantId!==session.tenantId||
      membership.conversationId!==threadId)throw Error("access_denied");
   const conversation=await readConversation({env,tenantId:session.tenantId,threadId});
   if(!conversation||conversation.tenantId!==session.tenantId||conversation.id!==threadId||
      conversation.status!=="active")throw Error("access_denied");
   return {session,workspaceMembership:membership,conversation,
     csrfVerified:session.csrfVerified===true};
 };
}
