/**
 * Executable service-binding-only quotation draft Worker, STAGING CANDIDATE.
 * NOT deployed. No public routes or preview URLs are approved.
 * Deliberately excludes PDF, logo and issuance routes until their exact
 * template and production-compatible engine are independently accepted.
 */
import {createQuotationPrivateD1SessionVerifier} from "./quotation-private-d1-session-verifier.mjs";
import {createQuotationPrivateHostSessionGate} from "./quotation-private-host-session-gate.mjs";
import {createQuotationDraftD1Store} from "./quotation-draft-d1-store.mjs";
import {handleQuotationDraftPersistence} from "./quotation-draft-persistence-http.mjs";

const ORIGIN="https://quotation.internal.example.test";
const TENANT_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const readRoles=new Set(["owner","admin","manager","staff"]);
const editRoles=new Set(["owner","admin","manager"]);
const deny=()=>new Response("Not Found",{status:404,headers:{
 "cache-control":"private, no-store","x-content-type-options":"nosniff",
 "content-type":"text/plain; charset=utf-8"
}});
function equalSecret(expected,actual){
 if(typeof expected!=="string"||typeof actual!=="string"||
    expected.length<32||expected.length>256||expected.length!==actual.length)return false;
 let mismatch=0;
 for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^actual.charCodeAt(i);
 return mismatch===0;
}
function validEnvironment(env){
 return env?.QUOTATION_PRIVATE_STAGE==="synthetic-internal-only"&&
  env?.QUOTATION_PRIVATE_ORIGIN===ORIGIN&&
  TENANT_PATTERN.test(env?.QUOTATION_PRIVATE_TENANT_ID||"")&&
  typeof env?.QUOTATION_PRIVATE_SESSION_SECRET==="string"&&
  env.QUOTATION_PRIVATE_SESSION_SECRET.length>=32&&
  typeof env?.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET==="string"&&
  env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET.length>=32&&
  env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET!==env.QUOTATION_PRIVATE_SESSION_SECRET&&
  env?.AUTH_DB&&env?.QUOTE_DB&&env.AUTH_DB!==env.QUOTE_DB&&
  typeof env.AUTH_DB.prepare==="function"&&typeof env.QUOTE_DB.prepare==="function"&&
  env?.QUOTATION_BINDINGS_EXTERNALLY_VERIFIED==="exact-reviewed-staging-only";
}
/**
 * Worker fetch is callable only by a separately provisioned INTERNAL
 * Worker service binding. A secret and virtual-origin check are defense
 * in depth, NOT proof of Cloudflare binding identity or private routing.
 * Do not configure routes, workers.dev, or preview URLs for this script.
 */
export async function handleQuotationServiceBoundRequest(request,env){
 if(!(request instanceof Request)||!validEnvironment(env))return deny();
 if(!equalSecret(env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET,
   request.headers.get("x-quotation-private-caller")))return deny();
 const url=new URL(request.url);
 if(url.origin!==ORIGIN||url.pathname!=="/api/quotation/drafts"||
    !["GET","PUT"].includes(request.method))return deny();
 try{
  const tenant=env.QUOTATION_PRIVATE_TENANT_ID;
  const verifier=createQuotationPrivateD1SessionVerifier({
   enabled:true,environment:"quotation-private-staging",
   authDb:env.AUTH_DB,sessionSecret:env.QUOTATION_PRIVATE_SESSION_SECRET,
   expectedTenantId:tenant
  });
  const store=createQuotationDraftD1Store({db:env.QUOTE_DB});
  const authorization=Object.freeze({
   async assertCompanyReader({actor,companyId}={}){
    return actor?.tenantId===tenant&&companyId===tenant&&
      typeof actor.userId==="string"&&readRoles.has(actor.role);
   },
   async assertCompanyEditor({actor,companyId}={}){
    return actor?.tenantId===tenant&&companyId===tenant&&
      typeof actor.userId==="string"&&editRoles.has(actor.role);
   }
  });
  const gate=createQuotationPrivateHostSessionGate({
   enabled:true,environment:"quotation-private-staging",
   expectedTenantId:tenant,allowedPrivateOrigin:ORIGIN,
   ...verifier,quotationHandlers:{handle:args=>
    handleQuotationDraftPersistence({...args,authorization,
      verifyMutation:verifier.verifyMutation,store})}
  });
  return await gate.handle(request);
 }catch{return deny()}
}
export default Object.freeze({fetch:handleQuotationServiceBoundRequest});
