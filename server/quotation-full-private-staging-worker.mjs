/**
 * Full Lovely quotation private-staging Worker CANDIDATE.
 * No deployment is authorized. This code is not used by the existing
 * draft-only staging manifest. It must never receive a public route.
 *
 * Operational proof of binding identity and the private caller's isolation
 * is EXTERNAL to this module. Source flags are defense in depth, not proof.
 */
import {LOVELY_FINAL_HTML_REFERENCE}
 from "./quotation-final-html-contract.mjs";
import {createQuotationSyntheticPrivateIntegration}
  from "./quotation-synthetic-private-integration.mjs";

const DENY_HEADERS={
 "content-type":"text/plain; charset=utf-8",
 "cache-control":"private, no-store",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer"
};
const deny=()=>new Response("Not Found",{status:404,headers:DENY_HEADERS});
const TEMPLATE_SHA="8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e";
const RESOURCES=Object.freeze({
 authDbId:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDbId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBucket:"bw-quotation-logo-private-staging",
 templateBucket:"bw-quotation-template-private-staging"
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function approvedRegistry(env){
 // Parse privileged Worker configuration only; NEVER accept template JSON
 // from request payloads, headers, query, tenant settings or cookies.
 const raw=env?.QUOTATION_APPROVED_PRIVATE_TEMPLATE_JSON;
 if(typeof raw!=="string"||raw.length>4096)return null;
 let record;
 try{record=JSON.parse(raw)}catch{return null}
 const tenant=env.QUOTATION_PRIVATE_TENANT_ID;
 if(!UUID.test(tenant)||!record||Array.isArray(record)||
    Object.keys(record).length!==1||!Object.hasOwn(record,tenant))return null;
 const t=record[tenant];
 if(!t||t.companyId!==tenant||t.sha256!==TEMPLATE_SHA||
    t.logoFree!==true||!Array.isArray(t.pages)||t.pages.length!==2||
    typeof t.privateObjectKey!=="string"||
    !t.privateObjectKey.startsWith("quotation-templates/"+tenant+"/"))return null;
 return record;
}
function qualified(env){
 return env?.QUOTATION_FULL_PDF_ENABLED==="approved-private-staging-only"&&
  env?.QUOTATION_PRIVATE_STAGE==="synthetic-internal-only"&&
  env?.QUOTATION_BINDINGS_EXTERNALLY_VERIFIED==="exact-reviewed-staging-only"&&
  env?.QUOTATION_PRIVATE_ORIGIN==="https://quotation.internal.example.test"&&
  UUID.test(env?.QUOTATION_PRIVATE_TENANT_ID||"")&&
  typeof env?.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET==="string"&&
  env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET.length>=32&&
  typeof env?.QUOTATION_PRIVATE_SESSION_SECRET==="string"&&
  env.QUOTATION_PRIVATE_SESSION_SECRET.length>=32&&
  env.QUOTATION_PRIVATE_SESSION_SECRET!==env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET&&
  env?.AUTH_DB?.prepare&&env?.QUOTE_DB?.prepare&&env.AUTH_DB!==env.QUOTE_DB&&
  typeof env?.LOGO_R2?.get==="function"&&
  typeof env?.LOGO_R2?.put==="function"&&
  typeof env?.LOGO_R2?.delete==="function"&&
  typeof env?.TEMPLATE_R2?.get==="function"&&
  typeof env?.QUOTATION_PRIVATE_PDF_ENGINE?.PDFDocument?.load==="function"&&
  typeof env?.QUOTATION_PRIVATE_PDF_ENGINE?.PDFDocument?.create==="function";
}
/** Caller must be independently authenticated as an INTERNAL service binding.
 * A correct header and fake .test origin do not establish that isolation.
 */
export async function handleQuotationFullPrivateRequest(request,env){
 if(!(request instanceof Request)||!qualified(env))return deny();\n // Owner superseded the fixed Candidate B PDF with the editable HTML design.\n // This Worker remains intentionally inert until the actual HTML-derived\n // PDF renderer and exact template are separately integrated and qualified.\n // Importing a new checksum or setting environment flags is not approval.\n if(LOVELY_FINAL_HTML_REFERENCE.format==="thebe-lovely-quote-template-v1")\n  return deny();
 const registry=approvedRegistry(env);
 if(!registry)return deny();
 try{
  const integration=createQuotationSyntheticPrivateIntegration({
   enabled:true,environment:"quotation-private-staging",
   expectedTenantId:env.QUOTATION_PRIVATE_TENANT_ID,
   allowedPrivateOrigin:env.QUOTATION_PRIVATE_ORIGIN,
   authDb:env.AUTH_DB,quoteDb:env.QUOTE_DB,
   sessionSecret:env.QUOTATION_PRIVATE_SESSION_SECRET,
   internalCallerSecret:env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET,
   privateLogoBucket:env.LOGO_R2,
   privateTemplateBucket:env.TEMPLATE_R2,
   approvedTemplates:registry,
   pdfLib:env.QUOTATION_PRIVATE_PDF_ENGINE,
   resourceIdentity:RESOURCES
  });
  return await integration.handle(request);
 }catch{return deny()}
}
export default Object.freeze({fetch:handleQuotationFullPrivateRequest});
