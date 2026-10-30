// Stateless, tenant-bound pagination cursor for rehearsal use only.
// Caller must enforce authenticated membership on every page; never treat cursor as authorization.
const encoder=new TextEncoder();
const decoder=new TextDecoder();
function bytesToHex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")}
function hexToBytes(hex){if(typeof hex!=="string"||hex.length%2||!/^[0-9a-f]+$/.test(hex))throw Error("invalid_cursor");return Uint8Array.from(hex.match(/../g).map(x=>parseInt(x,16)))}
async function signature(key,message){const cryptoKey=await crypto.subtle.importKey("raw",encoder.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,encoder.encode(message))))}
const validId=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,128}$/.test(x);
export async function encodeConversationCursor({tenantId,threadId,createdAt,messageId,secret}={}){
 if(!validId(tenantId)||!validId(threadId)||!validId(messageId)||typeof createdAt!=="string"||createdAt.length>64||!createdAt||typeof secret!=="string"||secret.length<32)throw Error("invalid_cursor");
 const payload=bytesToHex(encoder.encode(JSON.stringify({v:1,t:tenantId,c:threadId,a:createdAt,m:messageId})));
 return payload+"."+await signature(secret,payload);
}
export async function decodeConversationCursor({cursor,tenantId,threadId,secret}={}){
 if(typeof cursor!=="string"||cursor.length>1500||!validId(tenantId)||!validId(threadId)||typeof secret!=="string"||secret.length<32)return null;
 const parts=cursor.split(".");
 if(parts.length!==2||parts[1].length!==64)return null;
 try{
  const expected=await signature(secret,parts[0]);
  // Equal-length constant-time XOR for signature bytes; no early byte exit.
  const a=hexToBytes(expected),b=hexToBytes(parts[1]);if(a.length!==b.length)return null;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];if(diff)return null;
  const p=JSON.parse(decoder.decode(hexToBytes(parts[0])));
  if(p?.v!==1||p.t!==tenantId||p.c!==threadId||!validId(p.m)||typeof p.a!=="string"||!p.a||p.a.length>64)return null;
  return Object.freeze({createdAt:p.a,messageId:p.m});
 }catch{return null}
}
