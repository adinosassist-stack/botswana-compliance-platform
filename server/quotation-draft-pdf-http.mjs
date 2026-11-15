/**
 * Inert, non-issuing POST quotation PDF draft preview.
 *
 * Host must pass an actor and companyId resolved from a VERIFIED session,
 * tenant-scoped private logo/template adapters, pdfLib and a dedicated
 * anti-CSRF verifier. Never mount as a public route without approval.
 * Does not save, number, issue, email or settle quotations.
 */
import {validateQuotationDraft} from "./quotation-draft-model.mjs";
import {renderCompanyQuotationLogoPdf} from "./quotation-logo-pdf.mjs";

const ENDPOINT="/api/quotation/draft/pdf-preview";
const MAX_DRAFT_BYTES=32768;
const MAX_PDF_BYTES=10*1024*1024;
const jsonError=(status,error)=>new Response(JSON.stringify({ok:false,error}),{
 status,headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":"private, no-store","x-content-type-options":"nosniff"}
});
const fail=code=>{throw Error(code)};
async function readDraft(request){
 const contentType=request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
 if(contentType!=="application/json")fail("invalid_quotation_draft_content_type");
 const lengthText=request.headers.get("content-length");
 if(lengthText!==null){
  if(!/^\d+$/.test(lengthText)||Number(lengthText)>MAX_DRAFT_BYTES)
   fail("quotation_draft_request_too_large");
 }
 const reader=request.body?.getReader();
 if(!reader)fail("empty_quotation_draft");
 let n=0;const chunks=[];
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))fail("invalid_quotation_draft_body");
   n+=value.byteLength;if(n>MAX_DRAFT_BYTES)fail("quotation_draft_request_too_large");
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 if(n===0)fail("empty_quotation_draft");
 const all=new Uint8Array(n);let i=0;
 for(const chunk of chunks){all.set(chunk,i);i+=chunk.length}
 try{
  const parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all));
  return validateQuotationDraft(parsed);
 }catch(e){
  if(e?.message?.startsWith("invalid_quotation")||
     e?.message==="unsupported_quotation_field"||
     e?.message==="quotation_money_overflow")throw e;
  fail("invalid_quotation_draft");
 }
}
export async function handleQuotationDraftPdfPreview({
 request,actor,companyId,authorization,verifyMutation,store,templates,pdfLib
}={}){
 if(!(request instanceof Request))return jsonError(400,"invalid_request");
 if(new URL(request.url).pathname!==ENDPOINT)return jsonError(404,"not_found");
 if(request.method!=="POST")return jsonError(405,"method_not_allowed");
 if(!actor||typeof companyId!=="string"||!companyId||
    typeof authorization?.assertCompanyEditor!=="function")
  return jsonError(403,"quotation_draft_access_denied");
 // Editing rights and CSRF are checked BEFORE body read, PDF generation, or
 // private data access. Failed verifier/authorization exceptions fail closed.
 try{
  if(await authorization.assertCompanyEditor({actor,companyId})!==true)
   return jsonError(403,"quotation_draft_access_denied");
  if(typeof verifyMutation!=="function"||
     await verifyMutation({request,actor,companyId})!==true)
   return jsonError(403,"quotation_draft_mutation_denied");
 }catch{return jsonError(403,"quotation_draft_access_denied")}
 if(!store||!templates||typeof pdfLib?.PDFDocument?.load!=="function")
  return jsonError(503,"quotation_draft_pdf_unavailable");
 try{
  const draft=await readDraft(request);
  const result=await renderCompanyQuotationLogoPdf({
   actor,companyId,authorization,store,templates,pdfLib,draft
  });
  const pdf=result?.bytes;
  if(!(pdf instanceof Uint8Array)||pdf.byteLength<5||
     pdf.byteLength>MAX_PDF_BYTES||pdf[0]!==37||pdf[1]!==80||
     pdf[2]!==68||pdf[3]!==70||pdf[4]!==45)
   return jsonError(500,"invalid_quotation_pdf_output");
  return new Response(pdf.slice(),{status:200,headers:{
   "content-type":"application/pdf",
   "content-disposition":'attachment; filename="quotation-draft-preview.pdf"',
   "content-length":String(pdf.byteLength),
   "cache-control":"private, no-store",
   "x-content-type-options":"nosniff",
   "content-security-policy":"sandbox"
  }});
 }catch(e){
  const code=String(e?.message||"");
  if(code==="quotation_draft_request_too_large")return jsonError(413,code);
  if(code==="invalid_quotation_draft_content_type")return jsonError(415,code);
  if(code==="empty_quotation_draft"||code==="invalid_quotation_draft_body"||
     code==="invalid_quotation_draft"||code==="unsupported_quotation_field"||
     code==="quotation_money_overflow"||code.startsWith("invalid_quotation_"))
   return jsonError(400,"invalid_quotation_draft");
  if(code==="logo_access_denied"||code==="quotation_template_access_denied")
   return jsonError(403,"quotation_draft_access_denied");
  return jsonError(422,"quotation_draft_pdf_preview_unavailable");
 }
}
