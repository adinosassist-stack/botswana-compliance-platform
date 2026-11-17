/**
 * Synthetic-only private quotation caller, source only / NOT DEPLOYED.
 *
 * This worker must have no public routes, workers.dev or preview URLs.
 * It only probes the approved quotation service binding with an anonymous
 * GET, expecting the quotation worker to DENY the request (401).
 *
 * No mutation, customer cookie, tenant ID, R2, PDF, or production access.
 */
const PRIVATE_ORIGIN="https://quotation.internal.example.test";
const PATH="/api/quotation/drafts";
const deny=()=>new Response("Not Found",{status:404,headers:{
 "cache-control":"private, no-store","content-type":"text/plain; charset=utf-8",
 "x-content-type-options":"nosniff"
}});
const exactSecret=(value)=>typeof value==="string"&&value.length>=32&&value.length<=256;
function validEnv(env){
 return env?.QUOTATION_SYNTHETIC_CALLER_STAGE==="synthetic-only"&&
  env?.QUOTATION_PRIVATE_ORIGIN===PRIVATE_ORIGIN&&
  typeof env?.QUOTATION_SERVICE?.fetch==="function"&&
  exactSecret(env?.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET)&&
  exactSecret(env?.QUOTATION_SYNTHETIC_PROBE_SECRET)&&
  env.QUOTATION_SYNTHETIC_PROBE_SECRET!==env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET;
}
function sameSecret(expected,actual){
 if(!exactSecret(expected)||typeof actual!=="string"||
    expected.length!==actual.length)return false;
 let diff=0;
 for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^actual.charCodeAt(i);
 return diff===0;
}
export async function handleQuotationAnonymousPrivateProbe(request,env){
 if(!(request instanceof Request)||!validEnv(env))return deny();
 // Requires independently authenticated private operator access. No public route
 // is approved regardless of this additional verification header.
 if(!sameSecret(env.QUOTATION_SYNTHETIC_PROBE_SECRET,
    request.headers.get("x-quotation-synthetic-probe")))return deny();
 const u=new URL(request.url);
 if(u.origin!==PRIVATE_ORIGIN||u.pathname!=="/probe/anonymous"||
    request.method!=="GET"||u.search||u.hash)return deny();
 try{
  const upstream=new Request(PRIVATE_ORIGIN+PATH,{
   method:"GET",headers:{
    "x-quotation-private-caller":env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET,
    "accept":"application/json"
   }
  });
  const response=await env.QUOTATION_SERVICE.fetch(upstream);
  // Do not forward any upstream body, headers or information to caller.
  if(response?.status!==401)return deny();
  return new Response("Anonymous denial verified",{status:200,headers:{
    "cache-control":"private, no-store","content-type":"text/plain; charset=utf-8",
    "x-content-type-options":"nosniff"
  }});
 }catch{return deny()}
}
export default Object.freeze({fetch:handleQuotationAnonymousPrivateProbe});
