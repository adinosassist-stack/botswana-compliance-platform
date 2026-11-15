/**
 * Inert staging PDF preview composition.
 * Explicitly wires authenticated tenant-scoped D1/R2 logo storage,
 * operator-controlled SHA-256 pinned private templates, and an injected
 * real PDF engine (pdfLib). This DOES NOT install pdf-lib, mount an HTTP route,
 * provision a bucket, or approve a template.
 *
 * The host must resolve actor/company from verified auth and supply the
 * appropriate separate private R2 bindings. A tenant cannot choose keys or
 * template registry entries over the network.
 */
import {createQuotationLogoStore} from "./quotation-logo-d1-r2-store.mjs";
import {createApprovedQuotationTemplateProvider} from "./quotation-logo-template-provider.mjs";
import {handleQuotationLogoPdfPreview} from "./quotation-logo-pdf-http.mjs";
import {handleQuotationDraftPdfPreview} from "./quotation-draft-pdf-http.mjs";

export function createNodeStagingQuotationPdfPreviewHandler({
 db,privateLogoBucket,privateTemplateBucket,approvedTemplates,authorization,pdfLib,verifyMutation
}={}){
 if(typeof authorization?.assertCompanyReader!=="function"||
    typeof authorization?.assertCompanyEditor!=="function"||
    typeof verifyMutation!=="function"||
    typeof pdfLib?.PDFDocument?.load!=="function"||
    !db?.prepare||!privateLogoBucket?.get||!privateLogoBucket?.put||
    !privateTemplateBucket?.get||!approvedTemplates||typeof approvedTemplates!=="object")
   throw Error("quotation_pdf_staging_unconfigured");
 const store=createQuotationLogoStore({db,bucket:privateLogoBucket});
 const templates=createApprovedQuotationTemplateProvider({
  registry:approvedTemplates,privateStore:privateTemplateBucket
 });
 return async function previewRequest({request,actor,companyId}={}){
  // Separate POST-only, CSRF-guarded non-issuing draft preview.
  // Startup refuses to serve either preview when no CSRF verifier is configured.
  if(request instanceof Request&&
     new URL(request.url).pathname==="/api/quotation/draft/pdf-preview")
   return handleQuotationDraftPdfPreview({request,actor,companyId,
    authorization,verifyMutation,store,templates,pdfLib});
  return handleQuotationLogoPdfPreview({
   request,actor,companyId,authorization,store,templates,pdfLib
  });
 };
}
