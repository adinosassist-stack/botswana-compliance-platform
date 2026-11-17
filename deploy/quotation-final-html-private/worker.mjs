/**
 * Private quotation Browser Run Worker bundle candidate. INERT BY DEFAULT.
 * Its default HTTP handler denies all traffic, including internal service
 * bindings, until a separately reviewed host supplies real session authority.
 * No object upload or URL activation is authorized by bundling this code.
 */
import {chromium} from "@cloudflare/playwright";
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

export default Object.freeze({
 async fetch(){
  return new Response("Not Found",{status:404,headers:{
   "cache-control":"private, no-store",
   "x-content-type-options":"nosniff"
  }});
 }
});
