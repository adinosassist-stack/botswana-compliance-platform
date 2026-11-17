/**
 * SOURCE-ONLY private quotation integration boundary.
 *
 * Composes existing verified-session, member/CSRF and portable D1/R2/PDF
 * handlers for a synthetic internal-origin rehearsal. This module never
 * creates a route, Worker version, deployment, domain, database or template.
 * There is deliberately no default-exported Cloudflare fetch handler.
 */
import {createQuotationPrivateD1SessionVerifier} from "./quotation-private-d1-session-verifier.mjs";
import {createQuotationPrivateHostSessionGate} from "./quotation-private-host-session-gate.mjs";
import {createPortableQuotationPrivateHandlers} from "./quotation-portable-private-staging.mjs";

const fail=code=>{throw Error(code)};
const reject=()=>new Response("Not Found",{status:404,headers:{
 "content-type":"text/plain; charset=utf-8",
 "cache-control":"private, no-store","x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer"
}});
const EXACT_RESOURCES=Object.freeze({
 authDbId:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDbId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBucket:"bw-quotation-logo-private-staging",
 templateBucket:"bw-quotation-template-private-staging"
});
const allowedPaths=new Set([
 "/api/quotation/logo","/api/quotation/logo/upload",
 "/api/quotation/logo/image","/api/quotation/logo/pdf-preview",
 "/api/quotation/draft/pdf-preview","/api/quotation/drafts"
]);
const readerRoles=new Set(["owner","admin","manager","staff"]);
const editorRoles=new Set(["owner","admin","manager"]);
function sameSecret(expected,actual){
 if(typeof expected!=="string"||typeof actual!=="string"||
    expected.length<32||expected.length!==actual.length||expected.length>256)
    return false;
 let difference=0;
 for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^actual.charCodeAt(i);
 return difference===0;
}
/**
 * Resource identity assertions are INDEPENDENT inputs: validate actual
 * bound IDs/names in the protected host before creating this instance.
 * String equality here is only an additional safety fence, not remote proof.
 * All private data is synthetic until end-to-end staging is authorized.
 */
export function createQuotationSyntheticPrivateIntegration({
 enabled=false,environment,expectedTenantId,allowedPrivateOrigin,
 authDb,quoteDb,sessionSecret,internalCallerSecret,
 privateLogoBucket,privateTemplateBucket,approvedTemplates,pdfLib,
 resourceIdentity
}={}){
 if(enabled!==true||environment!=="quotation-private-staging")
  fail("quotation_private_integration_disabled");
 if(!resourceIdentity||Object.keys(EXACT_RESOURCES).some(k=>
     resourceIdentity[k]!==EXACT_RESOURCES[k])||
    Object.keys(resourceIdentity).some(k=>!Object.hasOwn(EXACT_RESOURCES,k)))
  fail("quotation_private_resource_identity_mismatch");
 if(!authDb||!quoteDb||authDb===quoteDb||
    typeof authDb.prepare!=="function"||typeof quoteDb.prepare!=="function")
  fail("quotation_private_db_isolation_required");
 if(typeof internalCallerSecret!=="string"||internalCallerSecret.length<32||
    internalCallerSecret.length>256||internalCallerSecret===sessionSecret)
  fail("quotation_private_internal_caller_unconfigured");
 // Synthetic-only virtual domain; never serve this via a real public hostname.
 let origin;
 try{
  const u=new URL(allowedPrivateOrigin);
  if(u.protocol!=="https:"||!u.hostname.endsWith(".test")&&
     !u.hostname.endsWith(".invalid")||u.pathname!=="/"||
     u.search||u.hash||u.username||u.password)
     fail("quotation_synthetic_origin_required");
  origin=u.origin;
 }catch{fail("quotation_synthetic_origin_required")}
 const verifier=createQuotationPrivateD1SessionVerifier({
  enabled:true,environment,authDb,sessionSecret,expectedTenantId
 });
 const scoped=(actor,companyId,editable)=>{
  return actor?.tenantId===expectedTenantId&&companyId===expectedTenantId&&
   typeof actor.userId==="string"&&
   (editable?editorRoles:readerRoles).has(actor.role);
 };
 // Do not trust an injected permission flag; derive rights from the verified
 // session actor and the EXACT expected synthetic tenant, independently.
 const authorization=Object.freeze({
  async assertCompanyReader({actor,companyId}={}){return scoped(actor,companyId,false)},
  async assertCompanyEditor({actor,companyId}={}){return scoped(actor,companyId,true)}
 });
 const quotationHandlers=createPortableQuotationPrivateHandlers({
  enabled:true,db:quoteDb,privateLogoBucket,privateTemplateBucket,
  approvedTemplates,pdfLib,authorization,verifyMutation:verifier.verifyMutation
 });
 const gated=createQuotationPrivateHostSessionGate({
  enabled:true,environment,expectedTenantId,allowedPrivateOrigin:origin,
  readVerifiedSession:verifier.readVerifiedSession,
  verifyActiveMembership:verifier.verifyActiveMembership,
  verifyMutation:verifier.verifyMutation,quotationHandlers
 });
 return Object.freeze({
  async handle(request){
   // Caller check is before session lookup, D1 access, body read or routing.
   if(!(request instanceof Request)||!sameSecret(
     internalCallerSecret,request.headers.get("x-quotation-private-caller")))
     return reject();
   let url;
   try{url=new URL(request.url)}catch{return reject()}
   if(url.origin!==origin||!allowedPaths.has(url.pathname))
    return reject();
   return gated.handle(request);
  },
  // Intentionally exposes only a callable test boundary. No fetch() export,
  // URL, R2 write, Worker deployment or customer quotation issuance.
  reviewOnly:true
 });
}
