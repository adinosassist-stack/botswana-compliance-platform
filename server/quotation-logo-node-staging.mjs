/**
 * Explicit Node-only, inert staging composition for quotation logo endpoints.
 * No routes are mounted. Pass authenticated actor/company, trusted authorization,
 * private D1/R2 store and a CSRF verifier from the existing host integration.
 * No JPEG support until a vetted server decoder has been provisioned.
 *
 * Node zlib is not Cloudflare Worker compatible; do NOT import this module into
 * cloudflare/src/worker.js. Production activation requires separate approval.
 */
import {decodeAndSanitizePngLogo} from "./quotation-logo-png-sanitizer.mjs";
import {handleQuotationLogoHttp} from "./quotation-logo-http.mjs";

export function createNodeStagingQuotationLogoHandler({
 authorization,store,verifyMutation
}={}){
 if(typeof authorization?.assertCompanyEditor!=="function"||
    typeof authorization?.assertCompanyReader!=="function"||
    typeof store?.writePrivateAsset!=="function"||
    typeof store?.readPrivateAsset!=="function"||
    typeof store?.upsertCompanyLogoSettings!=="function"||
    typeof store?.getCompanyLogoSettings!=="function"||
    typeof verifyMutation!=="function")
  throw Error("node_staging_quotation_logo_unconfigured");
 return async function stagingQuotationLogoRequest({request,actor,companyId}={}){
  return handleQuotationLogoHttp({request,actor,companyId,authorization,store,
   verifyMutation,decodeAndSanitizeLogo:decodeAndSanitizePngLogo});
 };
}
