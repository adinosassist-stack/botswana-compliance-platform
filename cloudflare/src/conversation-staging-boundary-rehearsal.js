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
  // Bound bytes while reading, including chunked bodies without Content-Length.
  // The actual route must still impose platform-level request limits.
  const rawLength=request.headers?.get?.("content-length");
  if(rawLength!==null&&rawLength!==undefined){
    if(!/^[0-9]+$/.test(String(rawLength)))return deny(400,"invalid_content_length");
    if(Number(rawLength)>8192)return deny(413,"payload_too_large");
  }
  if(!request.body?.getReader)return deny(400,"missing_body_stream");
  const reader=request.body.getReader();
  const chunks=[];
  let total=0,body;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))return deny(400,"invalid_body_chunk");
      total+=value.byteLength;
      if(total>8192){
        await reader.cancel().catch(()=>{});
        return deny(413,"payload_too_large");
      }
      chunks.push(value);
    }
    const bytes=new Uint8Array(total);
    let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
    body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  }catch{return deny(400,"invalid_json")}
  finally{try{reader.releaseLock()}catch{}}
  const result=await appendFromTrustedSession({env,context,clientBody:body,id});
  return {status:result.ok?200:result.error==="invalid_message"?400:result.error==="idempotency_conflict"?409:result.error==="access_denied"?403:503,body:result};
}
