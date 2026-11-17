/**
 * Source-only executable build entry for an ISOLATED, private, synthetic-only
 * quotation Worker. It is NOT referenced by the existing deployed manifest.
 * A bundled pdf-lib dependency is required and the app is disabled by default.
 * Do not deploy without exact-version approvals and private invoker proof.
 */
import {PDFDocument} from "pdf-lib";
import {handleQuotationFullPrivateRequest}
  from "./quotation-full-private-staging-worker.mjs";

export default Object.freeze({
 async fetch(request,env){
  return handleQuotationFullPrivateRequest(request,{
   ...env,
   QUOTATION_PRIVATE_PDF_ENGINE:Object.freeze({PDFDocument})
  });
 }
});
