// Unwired staging rehearsal reader. Session authorization runs on EVERY page.
// A signed cursor is pagination state only, never an access capability.
import {authorizeConversationAccess} from "./conversation-access-policy.js";
import {decodeConversationCursor,encodeConversationCursor} from "./conversation-cursor-rehearsal.js";
export async function readConversationPageRehearsal({env,actor,conversation,membership,cursor=null,secret,limit=25}={}){
 if(!authorizeConversationAccess({actor,conversation,membership,operation:"read"}).allowed)
   return {ok:false,error:"access_denied"};
 if(!env?.DB?.prepare||typeof secret!=="string"||secret.length<32)
   return {ok:false,error:"schema_unavailable"};
 const count=Number.isSafeInteger(limit)?Math.max(1,Math.min(50,limit)):25;
 let boundary=null;
 if(cursor!==null){
   boundary=await decodeConversationCursor({cursor,tenantId:actor.tenantId,threadId:conversation.id,secret});
   if(!boundary)return {ok:false,error:"invalid_cursor"};
 }
 try{
  // Authorize each page at the database read itself. Keep the NULL sentinel
  // when the authorized thread has no messages beyond this cursor.
  const authorized="WITH authorized AS (SELECT c.tenant_id,c.id FROM thebe_conversations_rehearsal c JOIN thebe_conversation_members_rehearsal m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id WHERE c.tenant_id=? AND c.id=? AND c.status='active' AND m.user_id=? AND m.active=1 AND m.role IN ('owner','admin','member','viewer')) ";
  const join="SELECT msg.id,msg.role,msg.source_kind,msg.content_redacted,msg.created_at FROM authorized a LEFT JOIN thebe_conversation_messages_rehearsal msg ON msg.tenant_id=a.tenant_id AND msg.conversation_id=a.id";
  const sql=authorized+join+(boundary?" AND (msg.created_at < ? OR (msg.created_at = ? AND msg.id < ?))":"")+" ORDER BY msg.created_at DESC,msg.id DESC LIMIT ?";
  const args=boundary
   ? [actor.tenantId,conversation.id,actor.userId,boundary.createdAt,boundary.createdAt,boundary.messageId,count+1]
   : [actor.tenantId,conversation.id,actor.userId,count+1];
  const result=await env.DB.prepare(sql).bind(...args).all();
  if(result?.success===false||!Array.isArray(result?.results))return {ok:false,error:"storage_unavailable"};
  if(!result.results.length)return {ok:false,error:"access_denied"};
  const rows=result.results.filter(row=>row.id!==null);
  const items=rows.slice(0,count);
  const last=items.at(-1);
  const nextCursor=rows.length>count&&last
   ? await encodeConversationCursor({tenantId:actor.tenantId,threadId:conversation.id,createdAt:last.created_at,messageId:last.id,secret})
   : null;
  return {ok:true,items,nextCursor};
 }catch{return {ok:false,error:"storage_unavailable"}}
}
