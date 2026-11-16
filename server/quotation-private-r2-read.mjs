/**
 * Bounded private R2 object reader for quotation assets and approved PDF templates.
 *
 * Never trust data length *after* unbounded arrayBuffer() on an R2 response.
 * Require Cloudflare R2's authoritative size metadata, decline unknown sizes,
 * and stream bytes with an independent count/size guard. The arrayBuffer-only
 * path exists for private trusted test/storage adapters and still requires
 * the declared size. No public URLs or unscoped fetches are used.
 */
const fail=code=>{throw Error(code)};
export async function readPrivateQuotationR2Bytes(object,{
 maxBytes,minBytes=1,errorCode="invalid_quotation_private_object"
}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||
    !Number.isSafeInteger(minBytes)||minBytes<1||minBytes>maxBytes)
  fail("quotation_r2_reader_unconfigured");
 if(!object||!Number.isSafeInteger(object.size)||
    object.size<minBytes||object.size>maxBytes)
  fail(errorCode);
 const declared=object.size;
 if(typeof object.body?.getReader==="function"){
  const reader=object.body.getReader(),chunks=[];
  let seen=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    if(!(value instanceof Uint8Array))fail(errorCode);
    seen+=value.byteLength;
    if(seen>maxBytes||seen>declared)fail(errorCode);
    chunks.push(value);
   }
  }finally{
   try{await reader.cancel()}catch{}
   reader.releaseLock();
  }
  if(seen!==declared||seen<minBytes)fail(errorCode);
  const out=new Uint8Array(seen);let pos=0;
  for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.length}
  return out;
 }
 // Strict fallback for synthetic adapters (actual R2 supplies .body).
 if(typeof object.arrayBuffer!=="function")fail(errorCode);
 const buffer=await object.arrayBuffer();
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==declared||
    buffer.byteLength<minBytes||buffer.byteLength>maxBytes)
  fail(errorCode);
 return new Uint8Array(buffer);
}
