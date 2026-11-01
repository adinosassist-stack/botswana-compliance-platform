/** Bounded, fail-closed JSON reader for paid General AI requests. */
export async function readGeneralAiJsonBody(request, maxBytes = 8500) {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    if (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))) return {ok:false,error:'invalid_content_length',status:400};
    if (Number(declared)>maxBytes) return {ok:false,error:'request_too_large',status:413};
  }
  if (!['', 'identity'].includes((request.headers.get('content-encoding')||'').toLowerCase())) return {ok:false,error:'unsupported_content_encoding',status:415};
  if (!request.body) return {ok:false,error:'invalid_json',status:400};
  let reader;
  const chunks=[];
  let size=0;
  try {
    reader=request.body.getReader();
    while (true) {
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.byteLength;
      if(size>maxBytes) {
        await reader.cancel('request_too_large').catch(()=>{});
        return {ok:false,error:'request_too_large',status:413};
      }
      chunks.push(value);
    }
  } catch {
    return {ok:false,error:'invalid_json',status:400};
  } finally {
    try {reader?.releaseLock()} catch {}
  }
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  try {
    const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return {ok:true,value:JSON.parse(raw)};
  } catch {return {ok:false,error:'invalid_json',status:400}}
}
