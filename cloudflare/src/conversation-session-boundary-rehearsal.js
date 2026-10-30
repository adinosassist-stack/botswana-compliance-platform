// Unwired adapter boundary. This intentionally has NO exported HTTP route.
// Only server-resolved trusted session and membership may construct the actor.
import {appendConversationMessageRehearsal,listConversationMessagesRehearsal} from "./conversation-storage-rehearsal.js";
import {readConversationPageRehearsal} from "./conversation-page-reader-rehearsal.js";
const deny=()=>({ok:false,error:"access_denied"});
function trustedInput(context){
  const {session,workspaceMembership,conversation}=context||{};
  if(!session||session.authenticated!==true||!session.userId||!session.tenantId||
     !workspaceMembership||workspaceMembership.active!==true||
     workspaceMembership.userId!==session.userId||
     workspaceMembership.tenantId!==session.tenantId||
     !conversation||conversation.tenantId!==session.tenantId)return null;
  return {
    actor:{authenticated:true,active:session.active===true,userId:session.userId,tenantId:session.tenantId},
    conversation,
    membership:{active:true,userId:workspaceMembership.userId,tenantId:workspaceMembership.tenantId,
      conversationId:workspaceMembership.conversationId,role:workspaceMembership.role}
  };
}
export async function appendFromTrustedSession({env,context,clientBody,id}={}){
  const bound=trustedInput(context);
  if(!bound)return deny();
  // Client supplied tenant/owner identifiers are never authoritative.
  const {role,sourceKind,content,idempotencyKey}=clientBody||{};
  return appendConversationMessageRehearsal({env,...bound,message:{role,sourceKind,content,idempotencyKey},id});
}
export async function readFromTrustedSession({env,context,limit}={}){
  const bound=trustedInput(context);
  if(!bound)return deny();
  return listConversationMessagesRehearsal({env,...bound,limit});
}

// Per-request identity resolution is compulsory, including on subsequent pages.
export async function readPageFromTrustedSession({env,context,cursor=null,secret,limit}={}){
  const bound=trustedInput(context);
  if(!bound)return deny();
  return readConversationPageRehearsal({env,...bound,cursor,secret,limit});
}
