export function evidenceFileSignatureMatches(contentType, bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]),ct=String(contentType||"").trim().toLowerCase();
  if(ct==="application/pdf")return b.length>=5&&b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46&&b[4]===0x2d;
  if(ct==="image/png")return b.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((x,i)=>b[i]===x);
  if(ct==="image/jpeg")return b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;
  if(ct==="application/vnd.openxmlformats-officedocument.wordprocessingml.document")return b.length>=4&&b[0]===0x50&&b[1]===0x4b&&[0x03,0x05,0x07].includes(b[2]);
  return false;
}
export async function boundedS3Prefix(body,maxBytes=4096){
  const limit=Math.max(16,Math.min(65536,Number(maxBytes)||4096));
  if(!body)return new Uint8Array();
  if(typeof body.transformToByteArray==="function"){
    const all=await body.transformToByteArray();
    if(all.byteLength>limit)throw new Error("evidence_signature_prefix_too_large");
    return all;
  }
  const chunks=[];let total=0;
  for await(const chunk of body){const b=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk);total+=b.byteLength;if(total>limit)throw new Error("evidence_signature_prefix_too_large");chunks.push(b)}
  const out=new Uint8Array(total);let off=0;for(const b of chunks){out.set(b,off);off+=b.byteLength}return out;
}
