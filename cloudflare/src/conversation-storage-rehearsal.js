// Unwired D1 adapter rehearsal. Caller supplies an authenticated actor and a
// server-resolved membership. Never expose these helpers as public routes directly.
import {authorizeConversationAccess,validateFinalConversationMessage} from "./conversation-access-policy.js";

const denied=()=>({ok:false,error:"access_denied"});
const ready=env=>Boolean(env?.DB?.prepare);
export async function appendConversationMessageRehearsal({env,actor,conversation,membership,message,id=()=>crypto.randomUUID()}={}){
  if(!ready(env))return {ok:false,error:"schema_unavailable"};
  if(!authorizeConversationAccess({actor,conversation,membership,operation:"append"}).allowed)return denied();
  if(!validateFinalConversationMessage(message).valid)return {ok:false,error:"invalid_message"};
  try{
    const tenant=actor.tenantId,thread=conversation.id;
    const messageId=id();
    // The tenant/thread/key UNIQUE constraint arbitrates concurrent retries.
    const result=await env.DB.prepare("INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,id,author_user_id,role,source_kind,content_redacted,idempotency_key) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,conversation_id,idempotency_key) DO NOTHING")
      .bind(tenant,thread,messageId,actor.userId,message.role,message.sourceKind,message.content,message.idempotencyKey).run();
    if(result?.success===false) return {ok:false,error:"storage_unavailable"};
    if(Number(result?.meta?.changes)===1)return {ok:true,id:messageId,duplicate:false};
    const prior=await env.DB.prepare("SELECT id,role,source_kind,content_redacted FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? AND idempotency_key=? LIMIT 1")
      .bind(tenant,thread,message.idempotencyKey).first();
    // A reused idempotency key with different content is a conflict, not success.
    if(!prior)return {ok:false,error:"storage_unavailable"};
    if(prior.role!==message.role||prior.source_kind!==message.sourceKind||prior.content_redacted!==message.content)
      return {ok:false,error:"idempotency_conflict"};
    return {ok:true,id:prior.id,duplicate:true};
  }catch{return {ok:false,error:"storage_unavailable"}}
}
export async function listConversationMessagesRehearsal({env,actor,conversation,membership,limit=25}={}){
  if(!ready(env))return {ok:false,error:"schema_unavailable"};
  if(!authorizeConversationAccess({actor,conversation,membership,operation:"read"}).allowed)return denied();
  const count=Math.max(1,Math.min(50,Number.isSafeInteger(limit)?limit:25));
  try{
    const rows=await env.DB.prepare("SELECT id,role,source_kind,content_redacted,created_at FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? ORDER BY created_at DESC,id DESC LIMIT ?")
      .bind(actor.tenantId,conversation.id,count).all();
    if(rows?.success===false||!Array.isArray(rows?.results))return {ok:false,error:"storage_unavailable"};
    return {ok:true,items:rows.results};
  }catch{return {ok:false,error:"storage_unavailable"}}
}
