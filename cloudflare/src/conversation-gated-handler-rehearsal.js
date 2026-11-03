// Unmounted composition guard: real Worker routing is deliberately unchanged.
import {mayEnableConversationRehearsal} from "./conversation-staging-gate.js";
import {handleConversationStagingRehearsal} from "./conversation-staging-http-rehearsal.js";
export async function handleGatedConversationRehearsal({request,env,deployment,privacyApproved=false,migrationQualified=false,context,id}={}){
 if(!mayEnableConversationRehearsal({env,deployment,privacyApproved,migrationQualified}))
  return new Response(JSON.stringify({error:"not_found"}),{status:404,headers:{"content-type":"application/json","cache-control":"no-store"}});
 // A caller's qualification claim alone is insufficient: verify real staging D1 schema.
 try {
  const rows=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?,?)").bind(
   "thebe_conversations_rehearsal","thebe_conversation_members_rehearsal","thebe_conversation_messages_rehearsal").all();
  const names=new Set((rows?.results||[]).map(row=>row.name));
  if(rows?.success===false||names.size!==3)throw new Error("schema_missing");
 }catch{
  return new Response(JSON.stringify({error:"schema_unavailable"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
 }
 return handleConversationStagingRehearsal({request,env,context,secret:env.CONVERSATION_CURSOR_SECRET,id});
}
