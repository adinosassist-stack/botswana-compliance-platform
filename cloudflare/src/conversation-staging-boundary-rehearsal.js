// Staging-only HTTP boundary contract; not registered in the worker router.
// The caller must supply a current, server-verified session, CSRF validation and
// workspace membership fetched from the server database for this request.
import {appendFromTrustedSession,readFromTrustedSession} from "./conversation-session-boundary-rehearsal.js";
const deny=(status=403,error="access_denied")=>({status,body:{ok:false,error}});
export async function conversationStagingBoundary({env,request,context,threadId,id}={}){
  if(!request||!context?.session?.authenticated||!context?.session?.active)return deny(401,"unauthenticated");
  if(context?.conversation?.id!==threadId||!context?.workspaceMembership?.active)return deny();
  if(request.method==="GET"){
    const result=await readFromTrustedSession({env,context,limit:25});
    return {status:result.ok?200:result.error==="access_denied"?403:503,body:result};
  }
  if(request.method!=="POST")return deny(405,"method_not_allowed");
  if(context.csrfVerified!==true)return deny(403,"csrf_required");
  const type=String(request.headers?.get?.("content-type")||"").split(";")[0].trim().toLowerCase();
  if(type!=="application/json")return deny(415,"unsupported_media_type");
  // Content-Length may be absent for chunked requests. Reject unknown sizes until
  // the worker has an explicitly bounded streaming JSON parser.
  const rawLength=request.headers?.get?.("content-length");
  if(rawLength===null||rawLength===undefined||!/^[0-9]+$/.test(String(rawLength)))
    return deny(411,"content_length_required");
  const length=Number(rawLength);
  if(!Number.isSafeInteger(length)||length>8192)return deny(413,"payload_too_large");
  let body;
  try{body=await request.json()}catch{return deny(400,"invalid_json")}
  // Defense in depth: reject decoded JSON that exceeds the declared body budget.
  // An eventual live route must ALSO enforce a streaming byte limit before JSON parsing.
  try{
    if(new TextEncoder().encode(JSON.stringify(body)).byteLength>8192)return deny(413,"payload_too_large");
  }catch{return deny(400,"invalid_json")}
  const result=await appendFromTrustedSession({env,context,clientBody:body,id});
  return {status:result.ok?200:result.error==="invalid_message"?400:result.error==="idempotency_conflict"?409:result.error==="access_denied"?403:503,body:result};
}
