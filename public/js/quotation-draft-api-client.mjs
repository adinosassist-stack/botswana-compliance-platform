/**
 * Opt-in browser transport for NON-ISSUING quotation draft PDF previews.
 *
 * Do not mount on the public site; only enable from an authenticated workspace
 * capability with a valid, session-bound CSRF token. Tenant is always derived
 * by the server, not sent in the draft or query string.
 */
const ENDPOINT="/api/quotation/draft/pdf-preview",MAX_PDF_BYTES=10*1024*1024;
const fail=code=>{throw Error(code)};
async function readPdf(response){
 if(!response.ok)fail("quotation_draft_preview_unavailable");
 const type=response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
 if(type!=="application/pdf")fail("invalid_quotation_preview_type");
 const claimed=response.headers.get("content-length");
 if(claimed!==null&&(!/^\d+$/.test(claimed)||Number(claimed)>MAX_PDF_BYTES))
  fail("quotation_preview_too_large");
 if(!response.body?.getReader)fail("quotation_preview_stream_unavailable");
 const reader=response.body.getReader(),chunks=[];
 let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   if(!(value instanceof Uint8Array))fail("invalid_quotation_preview_chunk");
   total+=value.byteLength;
   if(total>MAX_PDF_BYTES)fail("quotation_preview_too_large");
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const bytes=new Uint8Array(total);let pos=0;
 for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length}
 if(bytes.length<5||bytes[0]!==37||bytes[1]!==80||
    bytes[2]!==68||bytes[3]!==70||bytes[4]!==45)
  fail("invalid_quotation_preview_pdf");
 return new Blob([bytes],{type:"application/pdf"});
}
export function createQuotationDraftPreviewClient({fetchImpl,csrfToken,enabled=false}={}){
 if(enabled!==true)fail("quotation_draft_preview_disabled");
 if(typeof fetchImpl!=="function"||typeof csrfToken!=="string"||
    csrfToken.length<12||csrfToken.length>4096)
  fail("quotation_draft_preview_client_unconfigured");
 return Object.freeze({
  async previewPdf(draft){
   if(!draft||typeof draft!=="object"||Array.isArray(draft))
    fail("invalid_quotation_draft");
   // Money is checked and recalculated server-side. No client-provided tenant ID.
   const json=JSON.stringify(draft);
   if(typeof json!=="string"||new TextEncoder().encode(json).byteLength>32768)
    fail("quotation_draft_request_too_large");
   const res=await fetchImpl(ENDPOINT,{
    method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:json
   });
   return readPdf(res);
  }
 });
}
