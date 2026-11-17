/**
 * PRIVATE Browser Run print bridge — SOURCE ONLY; NO Worker fetch handler.
 *
 * The trusted host must inject Cloudflare's @cloudflare/playwright launch
 * function and its private Browser Run binding. This module does not accept
 * request-supplied authority or create public routes.
 *
 * Real deployment requires separately reviewed browser binding, active
 * D1-backed tenant session, role+CSRF verification and an isolated staging
 * service binding. A checked source flag cannot authorize a deployment.
 */
import {renderLovelyFinalQuotationPrivatePdf} from "./quotation-final-html-private-pdf.mjs";
import {LOVELY_FINAL_HTML_REFERENCE} from "./quotation-final-html-contract.mjs";
import {renderLovelyFinalQuotationPrintHtml} from "./quotation-final-html-print.mjs";
import {decodeAndSanitizeWebPngLogo} from "./quotation-logo-web-png-sanitizer.mjs";

const fail=code=>{throw Error(code)};
const validTenant=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,90}$/.test(x);

/**
 * Browser Run launch() binds a Cloudflare-managed remote Chromium session.
 * Do not invoke on untrusted input before the host has independently
 * authenticated the caller, verified same-tenant membership, and CSRF.
 */
export async function renderLovelyFinalHtmlWithBrowserRun({
  actor,companyId,draft,authority,verifyPrivateMutation,
  browserBinding,launchBrowser,pdfLib,logoSource=null,
  sourceSha256=LOVELY_FINAL_HTML_REFERENCE.sourceSha256
}={}){
 if(!validTenant(companyId)||!actor||
    typeof authority?.assertPrivatePreview!=="function"||
    typeof verifyPrivateMutation!=="function")
   fail("lovely_browser_run_private_host_unconfigured");
 if(!browserBinding||typeof launchBrowser!=="function"||
    typeof pdfLib?.PDFDocument?.load!=="function")
   fail("lovely_browser_run_binding_unconfigured");
 // These are trusted host-only functions, not user-provided assertions.
 // Gate before allocating any Cloudflare-managed browser time or reading R2.
 const roleGranted=await authority.assertPrivatePreview({actor,companyId,mode:"synthetic-preview"});
 if(roleGranted!==true)fail("lovely_browser_run_tenant_denied");
 const csrfVerified=await verifyPrivateMutation({actor,companyId});
 if(csrfVerified!==true)fail("lovely_browser_run_csrf_denied");
 // Validate all customer wording and required terms BEFORE allocating a
 // billable remote browser. No incomplete quote should consume a session.
 renderLovelyFinalQuotationPrintHtml(draft);
 // Resolve and sanitize the tenant logo once before browser launch. The
 // downstream renderer will recheck the sanitized copy, not reread R2.
 let checkedLogoSource=logoSource;
 if(logoSource!==null){
   if(typeof logoSource?.getPrivateCompanyLogo!=="function")
     fail("lovely_browser_run_private_logo_unconfigured");
   const asset=await logoSource.getPrivateCompanyLogo({actor,companyId});
   if(!asset||asset.mimeType!=="image/png"||
      !(asset.bytes instanceof Uint8Array))
     fail("lovely_browser_run_private_logo_unconfigured");
   const png=await decodeAndSanitizeWebPngLogo({
     bytes:asset.bytes,mimeType:asset.mimeType
   });
   if(png.width!==asset.width||png.height!==asset.height)
     fail("lovely_browser_run_private_logo_dimension_mismatch");
   checkedLogoSource={getPrivateCompanyLogo:async()=>({
     ...asset,bytes:png.bytes,mimeType:"image/png"
   })};
 }
 let browser;
 try{
   browser=await launchBrowser(browserBinding);
   if(!browser||typeof browser.newPage!=="function"||
      typeof browser.close!=="function")
     fail("lovely_browser_run_launch_invalid");
   return await renderLovelyFinalQuotationPrivatePdf({
     actor,companyId,draft,authority,browser,pdfLib,logoSource:checkedLogoSource,sourceSha256
   });
 }finally{
   if(browser&&typeof browser.close==="function")await browser.close();
 }
}
