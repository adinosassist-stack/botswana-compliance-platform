/** Bounded export-container signature check for private file delivery.
 * This is an admission check, NOT comprehensive PDF/OOXML parsing or malware scanning.
 * Actual DOCX/PPTX content still requires independent renderer qualification.
 */
const MAX_EXPORT_BYTES=20*1024*1024;
export function hasExpectedAiExportSignature(bytes,format){
 if(!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>MAX_EXPORT_BYTES)return false;
 if(format==="pdf")return bytes.toString("latin1",0,5)==="%PDF-";
 if(format==="docx"||format==="pptx"){
  // OOXML documents must be ZIP files starting with a local-file-header entry.
  return bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===0x03&&bytes[3]===0x04;
 }
 return false;
}
