export const MAX_EXTERNAL_RESPONSE_BYTES=512*1024;
function boundedMax(maxBytes){const n=Number(maxBytes);return Math.max(1024,Math.min(2*1024*1024,Number.isFinite(n)&&n>0?n:MAX_EXTERNAL_RESPONSE_BYTES))}
export async function externalResponseBytesBounded(response,{maxBytes=MAX_EXTERNAL_RESPONSE_BYTES}={}){
  const limit=boundedMax(maxBytes),declared=Number(response?.headers?.get?.('content-length')||0);
  if(Number.isFinite(declared)&&declared>limit)throw new Error('external_response_too_large');
  if(!response?.body)return new Uint8Array(0);
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>limit){try{await reader.cancel('external_response_too_large')}catch{}throw new Error('external_response_too_large')}chunks.push(value)}
  }finally{try{reader.releaseLock()}catch{}}
  const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}return merged;
}
export async function externalTextBounded(response,maxBytes=MAX_EXTERNAL_RESPONSE_BYTES){return new TextDecoder().decode(await externalResponseBytesBounded(response,{maxBytes}))}
export async function externalJsonBounded(response,maxBytes=256*1024){const text=await externalTextBounded(response,maxBytes);try{return JSON.parse(text)}catch{throw new Error('external_response_invalid_json')}}
