/**
 * Private quotation Browser Run Worker bundle candidate. INERT BY DEFAULT.
 * Its default HTTP handler denies all traffic, including internal service
 * bindings, until a separately reviewed host supplies real session authority.
 * No object upload or URL activation is authorized by bundling this code.
 */
import {chromium} from "@cloudflare/playwright";
import {WorkerEntrypoint} from "cloudflare:workers";
import {PDFDocument} from "pdf-lib";
import {createFinalLovelyPrivatePdfPreviewHost}
 from "../../server/quotation-final-html-private-preview-host.mjs";

/**
 * Trusted, independently approved staging composition ONLY. Resource/session
 * proof must be checked by the protected caller before constructing host.
 * The public fetch handler below never invokes this factory.
 */
export function createLockedQuotationBrowserRunPrivateHost({
 browserBinding,launchBrowser,...protectedConfiguration
}={}){
 if(!browserBinding||launchBrowser!==undefined)
  throw Error("quotation_browser_runtime_binding_required");
 return createFinalLovelyPrivatePdfPreviewHost({
  ...protectedConfiguration,
  browserBinding,
  launchBrowser:(binding)=>chromium.launch(binding)
 });
}


import {createIsolatedLovelyFinalHtmlStagingComposition}
 from "../../server/quotation-final-html-staging-bindings.mjs";

/** No HTTP route; exact independently attested, operator-only composition. */
export function createReviewedStagingFinalQuotationHost({
  env,proof,pdfLib
}={}){
 return createIsolatedLovelyFinalHtmlStagingComposition({
  env,proof,pdfLib,launchBrowser:binding=>chromium.launch(binding)
 });
}

// Named RPC class: *only* a separately approved Worker service binding
// targeting entrypoint QuotationSyntheticPrivateRpc may call previewSynthetic.
// No public URL, unauthenticated fetch route or user-provided proof accepted.
export class QuotationSyntheticPrivateRpc extends WorkerEntrypoint {
 async previewSynthetic(request){
  if(!(request instanceof Request))
   return new Response("Not Found",{status:404});
  const raw=this.env?.QUOTATION_PRIVATE_STAGE_PROOF_JSON;
  if(typeof raw!=="string"||raw.length<80||raw.length>4096)
   return new Response("Not Found",{status:404});
  let proof;
  try{proof=JSON.parse(raw)}
  catch{return new Response("Not Found",{status:404})}
  try{
   // Runtime config proof MUST be independently checked and installed
   // by the protected operator. Never derive it from the RPC Request.
   const host=createReviewedStagingFinalQuotationHost({
     env:this.env,proof,pdfLib:{PDFDocument}
   });
   return await host.handleInternal(request);
  }catch{
   return new Response("Not Found",{status:404});
  }
 }
}

export default Object.freeze({
 async fetch(){
  return new Response("Not Found",{status:404,headers:{
   "cache-control":"private, no-store",
   "x-content-type-options":"nosniff"
  }});
 }
});
