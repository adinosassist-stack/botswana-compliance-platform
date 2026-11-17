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
 let browser;
 try{
   browser=await launchBrowser(browserBinding);
   if(!browser||typeof browser.newPage!=="function"||
      typeof browser.close!=="function")
     fail("lovely_browser_run_launch_invalid");
   return await renderLovelyFinalQuotationPrivatePdf({
     actor,companyId,draft,authority,browser,pdfLib,logoSource,sourceSha256
   });
 }finally{
   if(browser&&typeof browser.close==="function")await browser.close();
 }
}
