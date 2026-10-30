// Staging-only, UNMOUNTED HTTP boundary for existing conversation rehearsal modules.
// Production Worker must NEVER route to this handler without a separate, reviewed
// server-session resolver, consent/retention policy, migration and feature gate.
import {appendFromTrustedSession,readPageFromTrustedSession} from "./conversation-session-boundary-rehearsal.js";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const validToken=x=>typeof x==="string"&&x.length>=16&&x.length<=256;
export async function handleConversationStagingRehearsal({request,env,context,secret,id}={}){
  if(!(request instanceof Request)||!context?.session?.authenticated||!context.session.active)return json({error:"access_denied"},403);
  const url=new URL(request.url);
  if(url.pathname!=="/api/staging/conversation-rehearsal/messages")return json({error:"not_found"},404);
  if(request.method==="GET"){
    const limit=Number(url.searchParams.get("limit")||25);
    const cursor=url.searchParams.get("cursor");
    const result=await readPageFromTrustedSession({env,context,secret,limit:Number.isSafeInteger(limit)?limit:25,cursor});
    return json(result,result.ok?200:result.error==="invalid_cursor"?400:result.error==="storage_unavailable"||result.error==="schema_unavailable"?503:403);
  }
  if(request.method==="POST"){
    const submitted=request.headers.get("x-csrf-token");
    if(!validToken(submitted)||!validToken(context.session.csrfToken)||submitted!==context.session.csrfToken)
      return json({error:"access_denied"},403);
    if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return json({error:"invalid_message"},415);
    let body;
    try{const raw=await request.text();if(raw.length>12000)return json({error:"invalid_message"},413);body=JSON.parse(raw)}
    catch{return json({error:"invalid_message"},400)}
    const result=await appendFromTrustedSession({env,context,clientBody:body,id});
    return json(result,result.ok?200:result.error==="invalid_message"?400:result.error==="storage_unavailable"||result.error==="schema_unavailable"?503:403);
  }
  return json({error:"method_not_allowed"},405);
}
