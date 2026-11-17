/**
 * Private quotation service-binding host, SOURCE ONLY.
 * No public Worker fetch entrypoint; host construction must be initiated
 * by an independently reviewed internal service-binding adapter.
 *
 * The resourceProof is evidence supplied by a protected operator workflow,
 * NEVER from request headers, URLs, cookies or customer content.
 * String IDs alone are not remote proof; the workflow must query Cloudflare.
 */
import {createQuotationPrivateRuntimeCandidate} from "./quotation-private-runtime-candidate.mjs";

const EXPECTED=Object.freeze({
 account:"ddd23cab31928a4bb3d4998df9b26d1d",
 worker:"bcaaf366ef7349a1a76a3a66735cb3af",
 authDbId:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDbId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBucket:"bw-quotation-logo-private-staging",
 templateBucket:"bw-quotation-template-private-staging"
});
const deny=()=>new Response("Not Found",{status:404,headers:{
 "content-type":"text/plain; charset=utf-8",
 "cache-control":"private, no-store",
 "x-content-type-options":"nosniff"
}});
const matching=(proof)=>{
 if(!proof||proof.verifiedByIndependentPreflight!==true||
    proof.publicAndPreviewUrlsDisabled!==true||
    proof.productionBindingsAbsent!==true||
    proof.currentSourceApproved!==true)return false;
 return Object.entries(EXPECTED).every(([key,value])=>proof[key]===value);
};
function privateOrigin(value){
 try{const u=new URL(value);return u.protocol==="https:" &&
  (u.hostname.endsWith(".test")||u.hostname.endsWith(".invalid")) &&
  u.pathname==="/"&&!u.search&&!u.hash&&!u.username&&!u.password}
 catch{return false}
}
/**
 * This factory is the only permitted entrypoint for an approved INTERNAL
 * service binding. It does not publish an internet route or create resources.
 */
export function createQuotationPrivateServiceBindingHost({
 env,resourceProof,pdfLib,approvedTemplates
}={}){
 if(!matching(resourceProof)||env?.QUOTATION_PRIVATE_STAGE!=="synthetic-internal-only"||
    !privateOrigin(env?.QUOTATION_PRIVATE_ORIGIN)||
    typeof env?.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET!=="string"||
    !env?.AUTH_DB||!env?.QUOTE_DB||
    env.AUTH_DB===env.QUOTE_DB||
    !env?.LOGO_R2||!env?.TEMPLATE_R2||
    !pdfLib?.PDFDocument||!approvedTemplates)
    throw Error("quotation_private_service_binding_not_qualified");
 const runtime=createQuotationPrivateRuntimeCandidate({
  approvedPrivateHost:true,bindingsIndependentlyVerified:true,
  enabled:true,environment:"quotation-private-staging",
  allowedPrivateOrigin:env.QUOTATION_PRIVATE_ORIGIN,
  expectedTenantId:env.QUOTATION_PRIVATE_TENANT_ID,
  authDb:env.AUTH_DB,quoteDb:env.QUOTE_DB,
  sessionSecret:env.QUOTATION_PRIVATE_SESSION_SECRET,
  internalCallerSecret:env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET,
  privateLogoBucket:env.LOGO_R2,
  privateTemplateBucket:env.TEMPLATE_R2,
  approvedTemplates,pdfLib,
  resourceIdentity:{
   authDbId:resourceProof.authDbId,quoteDbId:resourceProof.quoteDbId,
   logoBucket:resourceProof.logoBucket,
   templateBucket:resourceProof.templateBucket
  }
 });
 return Object.freeze({async handleInternal(request){
  // The runtime still checks caller secret, verified D1 session, tenant,
  // active membership, CSRF and private synthetic origin for every call.
  if(!(request instanceof Request))return deny();
  return runtime.fetch(request);
 }});
}
// NOT a Worker default fetch export. This module cannot serve a public URL.
