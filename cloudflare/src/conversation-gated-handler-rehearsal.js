// Unmounted composition guard: real Worker routing is deliberately unchanged.
import {mayEnableConversationRehearsal} from "./conversation-staging-gate.js";
import {handleConversationStagingRehearsal} from "./conversation-staging-http-rehearsal.js";
export async function handleGatedConversationRehearsal({request,env,deployment,privacyApproved=false,migrationQualified=false,context,id}={}){
 if(!mayEnableConversationRehearsal({env,deployment,privacyApproved,migrationQualified}))
  return new Response(JSON.stringify({error:"not_found"}),{status:404,headers:{"content-type":"application/json","cache-control":"no-store"}});
 return handleConversationStagingRehearsal({request,env,context,secret:env.CONVERSATION_CURSOR_SECRET,id});
}
