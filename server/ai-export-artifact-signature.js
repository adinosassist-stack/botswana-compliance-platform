/** Bounded PDF signature and OOXML ZIP-structure admission check.
 * Refuses malformed/mislabeled office containers before storing or serving bytes.
 * Not a malware scanner, archive decompressor, or full document-content validator.
 */
const MAX_EXPORT_BYTES=20*1024*1024;
const MAX_UNCOMPRESSED_BYTES=80*1024*1024;
const LOCAL=0x04034b50,CENTRAL=0x02014b50,EOCD=0x06054b50;
const u16=(b,i)=>b.readUInt16LE(i);
const u32=(b,i)=>b.readUInt32LE(i);
function validOfficeArchive(bytes,format){
 if(bytes.length<22||u32(bytes,0)!==LOCAL)return false;
 // EOCD may carry an archive comment; require it ends exactly at file end.
 const lower=Math.max(0,bytes.length-22-65535);
 let end=-1;
 for(let i=bytes.length-22;i>=lower;i--){
  if(u32(bytes,i)===EOCD&&i+22+u16(bytes,i+20)===bytes.length){end=i;break}
 }
 if(end<0||u16(bytes,end+4)!==0||u16(bytes,end+6)!==0||
    u16(bytes,end+8)!==u16(bytes,end+10))return false;
 const count=u16(bytes,end+10),size=u32(bytes,end+12),start=u32(bytes,end+16);
 if(count<3||count>2048||size>MAX_EXPORT_BYTES||start>=end||start+size!==end)return false;
 const entries=new Set();let offset=start,total=0;
 for(let i=0;i<count;i++){
  if(offset+46>end||u32(bytes,offset)!==CENTRAL)return false;
  const flags=u16(bytes,offset+8),method=u16(bytes,offset+10);
  const packed=u32(bytes,offset+20),expanded=u32(bytes,offset+24);
  const nameLength=u16(bytes,offset+28),extraLength=u16(bytes,offset+30),commentLength=u16(bytes,offset+32);
  const disk=u16(bytes,offset+34),localOffset=u32(bytes,offset+42);
  const next=offset+46+nameLength+extraLength+commentLength;
  if(!nameLength||next>end||disk!==0||(flags&1)!==0||
     ![0,8].includes(method)||packed===0xffffffff||expanded===0xffffffff||
     localOffset+30>start||packed>MAX_EXPORT_BYTES||expanded>MAX_UNCOMPRESSED_BYTES||
     (packed===0&&expanded>0)||(packed>0&&expanded>packed*2000))return false;
  total+=expanded;if(total>MAX_UNCOMPRESSED_BYTES)return false;
  const name=bytes.toString("utf8",offset+46,offset+46+nameLength);
  if(name.includes("\uFFFD")||name.includes("\\")||name.startsWith("/")||
     name.split("/").some(segment=>segment===".."||segment===".")||
     name.includes("\0")||entries.has(name)||
     /(?:^|\/)(?:vbaProject\.bin|[^/]*\.exe|[^/]*\.dll)$/i.test(name)||
     (/(?:^|\/)(?:activeX|embeddings)\//i.test(name)&&!name.endsWith("/")))return false;
  entries.add(name);
  if(u32(bytes,localOffset)!==LOCAL||u16(bytes,localOffset+8)!==method||
     (u16(bytes,localOffset+6)&1)!==0)return false;
  const localNameLength=u16(bytes,localOffset+26),localExtraLength=u16(bytes,localOffset+28);
  const dataStart=localOffset+30+localNameLength+localExtraLength;
  if(dataStart+packed>start||
     bytes.toString("utf8",localOffset+30,localOffset+30+localNameLength)!==name)return false;
  offset=next;
 }
 if(offset!==end)return false;
 return entries.has("[Content_Types].xml")&&entries.has("_rels/.rels")&&
  entries.has(format==="docx"?"word/document.xml":"ppt/presentation.xml");
}
export function hasExpectedAiExportSignature(bytes,format){
 if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>MAX_EXPORT_BYTES)return false;
 if(format==="pdf")return bytes.toString("latin1",0,5)==="%PDF-";
 if(format==="docx"||format==="pptx")return validOfficeArchive(bytes,format);
 return false;
}
