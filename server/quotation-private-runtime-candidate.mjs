/**
 * Private quotation runtime candidate. SOURCE ONLY — no deployed or public route.
 *
 * Cloudflare's default export remains deny-all. An approved internal host can
 * construct a handler only after independently proving bound D1/R2 identity,
 * private routing and synthetic tenant configuration.
 */
import {createQuotationSyntheticPrivateIntegration} from "./quotation-synthetic-private-integration.mjs";

const denialHeaders=Object.freeze({
 "content-type":"text/plain; charset=utf-8",
 "cache-control":"private, no-store",
 "x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer"
});
function deny(){return new Response("Not Found",{status:404,headers:denialHeaders})}

/**
 * Explicitly constructed by a future protected host, never from public
 * request-controlled headers. Calling this function does not verify that
 * Cloudflare bindings are genuine: independent remote binding proof is required.
 */
export function createQuotationPrivateRuntimeCandidate({
 approvedPrivateHost=false,bindingsIndependentlyVerified=false,
 ...configuration
}={}){
 if(approvedPrivateHost!==true||bindingsIndependentlyVerified!==true)
  throw Error("quotation_private_runtime_not_authorized");
 const integration=createQuotationSyntheticPrivateIntegration(configuration);
 return Object.freeze({
  async fetch(request){
   // The integration itself checks the private caller BEFORE reading cookies,
   // request bodies or D1, and restricts the origin to .test or .invalid.
   if(!(request instanceof Request))return deny();
   return integration.handle(request);
  }
 });
}

/** An accidental deployment remains opaque 404 for all requests. */
export default Object.freeze({async fetch(){return deny()}});
