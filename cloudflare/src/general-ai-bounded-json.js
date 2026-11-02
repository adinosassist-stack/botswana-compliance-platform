/** Bounded JSON parsing for trusted provider endpoints; never buffer unbounded bodies. */
export async function readBoundedProviderJson(response,maxBytes=1048576){
  if(!response?.body||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error("provider_response_unavailable");
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;
      if(total>maxBytes){await reader.cancel();throw Error("provider_response_too_large")}
      chunks.push(value);
    }
  }finally{reader.releaseLock()}
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
  catch{throw Error("provider_response_invalid")}
}
