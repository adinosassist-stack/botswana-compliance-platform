/**
 * Source-only, UNMOUNTED portable quotation staging composition.
 * The host owns session validation, tenant derivation, CSRF, private R2/D1
 * bindings, PDF engine and the explicit feature gate. Merely importing or
 * creating this function does not register routes, deploy Workers, run SQL,
 * register a PDF template or issue customer quotations.
 *
 * This is designed for Workers-compatible runtimes (Web Streams + Web Crypto),
 * but it still requires an independently qualified host integration and
 * exact-binary private template approval before any deployment.
 */
import {createQuotationLogoStore} from "./quotation-logo-d1-r2-store.mjs";
import {createQuotationDraftD1Store} from "./quotation-draft-d1-store.mjs";
import {createApprovedQuotationTemplateProvider} from "./quotation-logo-template-provider.mjs";
import {handleQuotationLogoHttp} from "./quotation-logo-http.mjs";
import {handleQuotationLogoPdfPreview} from "./quotation-logo-pdf-http.mjs";
import {handleQuotationDraftPdfPreview} from "./quotation-draft-pdf-http.mjs";
import {handleQuotationDraftPersistence} from "./quotation-draft-persistence-http.mjs";
import {decodeAndSanitizeWebPngLogo} from "./quotation-logo-web-png-sanitizer.mjs";

const fail=code=>{throw Error(code)};
const paths=new Set([
 "/api/quotation/logo",
 "/api/quotation/logo/upload",
 "/api/quotation/logo/image"
]);
const json=(status,code)=>new Response(JSON.stringify({ok:false,error:code}),{
 status,headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":"private, no-store","x-content-type-options":"nosniff"}
});

/**
 * enabled must be explicitly true; false by default even if bindings exist.
 * PDF engine supplied through protected host dependency, e.g. reviewed
 * pdf-lib. Only PNG uploads are permitted; no unsafe JPEG passthrough.
 */
export function createPortableQuotationPrivateHandlers({
 enabled=false,db,privateLogoBucket,privateTemplateBucket,approvedTemplates,
 authorization,verifyMutation,pdfLib
}={}){
 if(enabled!==true)fail("quotation_portable_staging_disabled");
 if(typeof authorization?.assertCompanyReader!=="function"||
    typeof authorization?.assertCompanyEditor!=="function"||
    typeof verifyMutation!=="function"||
    typeof db?.prepare!=="function"||
    typeof privateLogoBucket?.get!=="function"||
    typeof privateLogoBucket?.put!=="function"||
    typeof privateLogoBucket?.delete!=="function"||
    typeof privateTemplateBucket?.get!=="function"||
    !approvedTemplates||typeof approvedTemplates!=="object"||
    typeof pdfLib?.PDFDocument?.load!=="function"||
    typeof pdfLib?.PDFDocument?.create!=="function")
  fail("quotation_portable_staging_unconfigured");
 const store=createQuotationLogoStore({db,bucket:privateLogoBucket});
 const drafts=createQuotationDraftD1Store({db});
 const templates=createApprovedQuotationTemplateProvider({
  registry:approvedTemplates,privateStore:privateTemplateBucket
 });
 return Object.freeze({
  /**
   * Request and actor/companyId MUST be set by a trusted authenticated host.
   * This method never uses tenant IDs passed in HTTP bodies or query strings.
   */
  async handle({request,actor,companyId}={}){
   if(!(request instanceof Request))return json(400,"invalid_request");
   const path=new URL(request.url).pathname;
   if(path==="/api/quotation/logo/upload"&&
      request.method.toUpperCase()==="POST"&&
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()==="image/jpeg")
    return json(415,"unsupported_logo_type");
   if(paths.has(path))return handleQuotationLogoHttp({
    request,actor,companyId,authorization,store,verifyMutation,
    decodeAndSanitizeLogo:decodeAndSanitizeWebPngLogo
   });
   if(path==="/api/quotation/logo/pdf-preview")return handleQuotationLogoPdfPreview({
    request,actor,companyId,authorization,store,templates,pdfLib
   });
   if(path==="/api/quotation/draft/pdf-preview")return handleQuotationDraftPdfPreview({
    request,actor,companyId,authorization,store,templates,pdfLib,
    verifyMutation
   });
   if(path==="/api/quotation/drafts")return handleQuotationDraftPersistence({
    request,actor,companyId,authorization,verifyMutation,store:drafts
   });
   return json(404,"not_found");
  }
 });
}
