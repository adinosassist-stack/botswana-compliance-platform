/**
 * Inert company-scoped quotation PDF export boundary.
 * NOT registered in any production router. Caller supplies verified session
 * actor and company ID from server auth, plus a provisioned PDF engine.
 * Generates a sample branded two-page template; not an issued sales quote.
 */
import {renderCompanyQuotationLogoPdf} from "./quotation-logo-pdf.mjs";

const ENDPOINT="/api/quotation/logo/pdf-preview";
function jsonError(status,code){
 return new Response(JSON.stringify({ok:false,error:code}),{
  status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store",
   "x-content-type-options":"nosniff"}
 });
}
export async function handleQuotationLogoPdfPreview({
 request,actor,companyId,authorization,store,templates,pdfLib
}={}) {
 if(!(request instanceof Request))return jsonError(400,"invalid_request");
 if(new URL(request.url).pathname!==ENDPOINT)return jsonError(404,"not_found");
 if(request.method!=="GET")return jsonError(405,"method_not_allowed");
 // No automatic fallback to public templates, guest users or stale sessions.
 if(!actor||typeof companyId!=="string"||!companyId)
  return jsonError(403,"quotation_pdf_access_denied");
 if(typeof authorization?.assertCompanyReader!=="function")
  return jsonError(403,"quotation_pdf_access_denied");
 try{
  // Authorization can reject or throw (e.g. identity service outage).
  // Do not invoke template loader, storage or PDF generator until it succeeds.
  if(await authorization.assertCompanyReader({actor,companyId})!==true)
   return jsonError(403,"quotation_pdf_access_denied");
 }catch{return jsonError(403,"quotation_pdf_access_denied")}
 if(!store||!templates||!pdfLib?.PDFDocument?.load)
  return jsonError(503,"quotation_pdf_unavailable");
 try{
  const output=await renderCompanyQuotationLogoPdf({
   actor,companyId,authorization,store,templates,pdfLib
  });
  if(!(output.bytes instanceof Uint8Array)||output.bytes.length<5||
     output.bytes.length>10*1024*1024||
     output.bytes[0]!==37||output.bytes[1]!==80||
     output.bytes[2]!==68||output.bytes[3]!==70||
     output.bytes[4]!==45)
   return jsonError(500,"invalid_quotation_pdf_output");
  return new Response(output.bytes.slice(),{status:200,headers:{
   "content-type":"application/pdf",
   "content-disposition":'attachment; filename="quotation-logo-preview.pdf"',
   "cache-control":"private, no-store",
   "x-content-type-options":"nosniff",
   "content-security-policy":"sandbox",
   "content-length":String(output.bytes.length)
  }});
 }catch(e){
  if(["logo_access_denied","quotation_template_access_denied"].includes(e?.message))
   return jsonError(403,"quotation_pdf_access_denied");
  // Hide storage, asset keys and internal errors in network responses.
  return jsonError(422,"quotation_pdf_preview_unavailable");
 }
}
