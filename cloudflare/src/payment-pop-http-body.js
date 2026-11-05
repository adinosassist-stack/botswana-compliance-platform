// Bound actual streamed bytes; Content-Length alone is not authoritative.
export async function readPopBody(request,maxBytes){
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes))throw Error('pop_body_too_large');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>maxBytes){await reader.cancel().catch(()=>{});throw Error('pop_body_too_large')}chunks.push(value);
 }}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return bytes;
}
export async function readPopJson(request,maxBytes=16384){
 const bytes=await readPopBody(request,maxBytes);
 try{const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;
 }catch{throw Error('pop_invalid_body')}
}
