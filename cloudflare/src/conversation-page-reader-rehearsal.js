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
  const sql=boundary
   ? "SELECT id,role,source_kind,content_redacted,created_at FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC,id DESC LIMIT ?"
   : "SELECT id,role,source_kind,content_redacted,created_at FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? ORDER BY created_at DESC,id DESC LIMIT ?";
  const args=boundary
   ? [actor.tenantId,conversation.id,boundary.createdAt,boundary.createdAt,boundary.messageId,count+1]
   : [actor.tenantId,conversation.id,count+1];
  const result=await env.DB.prepare(sql).bind(...args).all();
  if(result?.success===false)return {ok:false,error:"storage_unavailable"};
  const rows=Array.isArray(result?.results)?result.results:[];
  const items=rows.slice(0,count);
  const last=items.at(-1);
  const nextCursor=rows.length>count&&last
   ? await encodeConversationCursor({tenantId:actor.tenantId,threadId:conversation.id,createdAt:last.created_at,messageId:last.id,secret})
   : null;
  return {ok:true,items,nextCursor};
 }catch{return {ok:false,error:"storage_unavailable"}}
}
