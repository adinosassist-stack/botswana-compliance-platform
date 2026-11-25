// Unwired D1 adapter rehearsal. Caller supplies an authenticated actor and a
// server-resolved membership. Never expose these helpers as public routes directly.
import {authorizeConversationAccess,validateFinalConversationMessage} from "./conversation-access-policy.js";

const denied=()=>({ok:false,error:"access_denied"});
const ready=env=>Boolean(env?.DB?.prepare);
// Repeat current database authorization inside the statement that reads or writes.
// An earlier authenticated context is not an irrevocable access capability.
const activeWriter="EXISTS (SELECT 1 FROM thebe_conversations_rehearsal c JOIN thebe_conversation_members_rehearsal m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id WHERE c.tenant_id=? AND c.id=? AND c.status='active' AND m.user_id=? AND m.active=1 AND m.role IN ('owner','admin','member'))";
export async function appendConversationMessageRehearsal({env,actor,conversation,membership,message,id=()=>crypto.randomUUID()}={}){
  if(!ready(env))return {ok:false,error:"schema_unavailable"};
  if(!authorizeConversationAccess({actor,conversation,membership,operation:"append"}).allowed)return denied();
  if(!validateFinalConversationMessage(message).valid)return {ok:false,error:"invalid_message"};
  try{
    const tenant=actor.tenantId,thread=conversation.id;
    const messageId=id();
    // The tenant/thread/key UNIQUE constraint arbitrates concurrent retries.
    const result=await env.DB.prepare("INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,id,author_user_id,role,source_kind,content_redacted,idempotency_key) SELECT ?,?,?,?,?,?,?,? WHERE "+activeWriter+" ON CONFLICT(tenant_id,conversation_id,idempotency_key) DO NOTHING")
      .bind(tenant,thread,messageId,actor.userId,message.role,message.sourceKind,message.content,message.idempotencyKey,tenant,thread,actor.userId).run();
    if(result?.success===false) return {ok:false,error:"storage_unavailable"};
    if(Number(result?.meta?.changes)===1)return {ok:true,id:messageId,duplicate:false};
    const prior=await env.DB.prepare("SELECT id,role,source_kind,content_redacted FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? AND idempotency_key=? AND author_user_id=? AND "+activeWriter+" LIMIT 1")
      .bind(tenant,thread,message.idempotencyKey,actor.userId,tenant,thread,actor.userId).first();
    // A reused idempotency key with different content is a conflict, not success.
    if(!prior)return denied();
    if(prior.role!==message.role||prior.source_kind!==message.sourceKind||prior.content_redacted!==message.content)
      return {ok:false,error:"idempotency_conflict"};
    return {ok:true,id:prior.id,duplicate:true};
  }catch{return {ok:false,error:"storage_unavailable"}}
}
export async function appendConversationExchangeRehearsal({env,actor,conversation,membership,exchange,id=()=>crypto.randomUUID()}={}){
  if(!ready(env))return {ok:false,error:"schema_unavailable"};
  if(!authorizeConversationAccess({actor,conversation,membership,operation:"append"}).allowed)return denied();
  const {question,answer,idempotencyKey}=exchange||{};
  if(typeof idempotencyKey!=="string"||idempotencyKey.length>116)return {ok:false,error:"invalid_message"};
  const turns=[
    {role:"user",sourceKind:"typed",content:question,idempotencyKey:idempotencyKey+"-prompt"},
    {role:"assistant",sourceKind:"assistant",content:answer,idempotencyKey:idempotencyKey+"-answer"}
  ];
  if(!turns.every(turn=>validateFinalConversationMessage(turn).valid))return {ok:false,error:"invalid_message"};
  const {tenantId,userId}=actor;
  const thread=conversation.id;
  const insert="WITH turns(id,role,source_kind,content_redacted,idempotency_key) AS (VALUES (?,?,?,?,?),(?,?,?,?,?)) "
    +"INSERT INTO thebe_conversation_messages_rehearsal(tenant_id,conversation_id,author_user_id,id,role,source_kind,content_redacted,idempotency_key) "
    +"SELECT ?,?,?,id,role,source_kind,content_redacted,idempotency_key FROM turns WHERE EXISTS ("
    +"SELECT 1 FROM thebe_conversations_rehearsal c JOIN thebe_conversation_members_rehearsal m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id "
    +"WHERE c.tenant_id=? AND c.id=? AND c.status='active' AND m.user_id=? AND m.active=1 AND m.role IN ('owner','admin','member'))";
  try{
    const entries=turns.flatMap(turn=>[id(),turn.role,turn.sourceKind,turn.content,turn.idempotencyKey]);
    const result=await env.DB.prepare(insert).bind(...entries,tenantId,thread,userId,tenantId,thread,userId).run();
    if(result?.success===true&&Number(result.meta?.changes)===2)return {ok:true,duplicate:false};
    if(result?.success===true&&Number(result.meta?.changes)===0)return denied();
  }catch{
    // A duplicate key aborts the complete statement. Check whether both
    // already committed rows represent an identical request.
  }
  try{
    const result=await env.DB.prepare("SELECT role,source_kind,content_redacted,idempotency_key,author_user_id FROM thebe_conversation_messages_rehearsal WHERE tenant_id=? AND conversation_id=? AND idempotency_key IN (?,?) AND "+activeWriter)
      .bind(tenantId,thread,...turns.map(turn=>turn.idempotencyKey),tenantId,thread,userId).all();
    if(result?.success!==true||!Array.isArray(result.results))return {ok:false,error:"storage_unavailable"};
    if(!result.results.length)return denied();
    const same=result.results.length===2&&turns.every(turn=>result.results.some(row=>row.idempotency_key===turn.idempotencyKey
      &&row.author_user_id===userId&&row.role===turn.role&&row.source_kind===turn.sourceKind&&row.content_redacted===turn.content));
    return same?{ok:true,duplicate:true}:{ok:false,error:"idempotency_conflict"};
  }catch{return {ok:false,error:"storage_unavailable"}}
}

export async function listConversationMessagesRehearsal({env,actor,conversation,membership,limit=25}={}){
  if(!ready(env))return {ok:false,error:"schema_unavailable"};
  if(!authorizeConversationAccess({actor,conversation,membership,operation:"read"}).allowed)return denied();
  const count=Math.max(1,Math.min(50,Number.isSafeInteger(limit)?limit:25));
  try{
    // LEFT JOIN distinguishes an authorized empty thread (one NULL message)
    // from a revoked/deleted thread (no rows), without a second authorization race.
    const rows=await env.DB.prepare("SELECT msg.id,msg.role,msg.source_kind,msg.content_redacted,msg.created_at FROM thebe_conversations_rehearsal c JOIN thebe_conversation_members_rehearsal m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id LEFT JOIN thebe_conversation_messages_rehearsal msg ON msg.tenant_id=c.tenant_id AND msg.conversation_id=c.id WHERE c.tenant_id=? AND c.id=? AND c.status='active' AND m.user_id=? AND m.active=1 AND m.role IN ('owner','admin','member','viewer') ORDER BY msg.created_at DESC,msg.rowid DESC LIMIT ?")
      .bind(actor.tenantId,conversation.id,actor.userId,count).all();
    if(rows?.success===false||!Array.isArray(rows?.results))return {ok:false,error:"storage_unavailable"};
    if(!rows.results.length)return denied();
    return {ok:true,items:rows.results.filter(row=>row.id!==null)};
  }catch{return {ok:false,error:"storage_unavailable"}}
}
