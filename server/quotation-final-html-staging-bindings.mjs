/**
 * READINESS-ONLY: compose the actual isolated quotation staging D1/R2 session
 * and Browser Run bindings with the owner-final editable HTML PDF path.
 *
 * No default fetch export, no Cloudflare uploads, no new routes.
 * The protected operator must independently verify resource IDs, account,
 * exact-main source, browser entitlement and separate owner/reviewer approvals
 * before creating a Worker version or binding this host to a private caller.
 *
 * An evidence object supplied to this factory is not remote proof.
 */
import {createQuotationPrivateD1SessionVerifier}
 from "./quotation-private-d1-session-verifier.mjs";
import {createQuotationDraftD1Store}
 from "./quotation-draft-d1-store.mjs";
import {createQuotationLogoStore}
 from "./quotation-logo-d1-r2-store.mjs";
import {createFinalLovelyPrivatePdfPreviewHost}
 from "./quotation-final-html-private-preview-host.mjs";

const fail=code=>{throw Error(code)};
const ACCOUNT="ddd23cab31928a4bb3d4998df9b26d1d";
const EXPECTED=Object.freeze({
 authDbId:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDbId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBucket:"bw-quotation-logo-private-staging",
 worker:"bw-quotation-final-html-private-staging"
});
const strong=s=>typeof s==="string"&&s.length>=32&&s.length<=256;
function sameSecret(expected,actual){
 if(!strong(expected)||typeof actual!=="string"||
    actual.length!==expected.length)return false;
 let mismatch=0;
 for(let i=0;i<expected.length;i++)
   mismatch|=expected.charCodeAt(i)^actual.charCodeAt(i);
 return mismatch===0;
}
function verified(proof){
 if(!proof||proof.accountId!==ACCOUNT||
    proof.verifiedByIndependentPreflight!==true||
    proof.exactMainReviewed!==true||
    proof.ownerExactOperationApprovalRecorded!==true||
    proof.independentThusicoOperationApprovalRecorded!==true||
    proof.stagingWorkerInert===false||
    proof.publicAndPreviewUrlsDisabled!==true||
    proof.productionBindingsAbsent!==true||
    proof.browserBindingQualified!==true||
    proof.browserRunEligibilityAndCostAccepted!==true||
    proof.isolatedSyntheticTenantVerified!==true||
    proof.privateCallerBindingVerified!==true||
    proof.recoveryPlanApproved!==true||
    !strong(proof.approvedSourceSha)||proof.approvedSourceSha!==proof.currentMainSha||
    Object.entries(EXPECTED).some(([k,v])=>proof[k]!==v))
   fail("lovely_html_staging_independent_preflight_required");
}
export function createIsolatedLovelyFinalHtmlStagingComposition({
 env,proof,pdfLib,launchBrowser
}={}){
 verified(proof);
 if(env?.QUOTATION_PRIVATE_STAGE!=="synthetic-internal-only"||
    !env?.AUTH_DB?.prepare||!env?.QUOTE_DB?.prepare||
    env.AUTH_DB===env.QUOTE_DB||
    !env?.LOGO_R2?.get||!env?.LOGO_R2?.put||
    !env?.QUOTATION_BROWSER||typeof launchBrowser!=="function"||
    !pdfLib?.PDFDocument?.load||
    !strong(env.QUOTATION_PRIVATE_SESSION_SECRET)||
    !strong(env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET)||
    env.QUOTATION_PRIVATE_SESSION_SECRET===env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET)
  fail("lovely_html_staging_isolated_bindings_required");
 const verifier=createQuotationPrivateD1SessionVerifier({
  enabled:true,environment:"quotation-private-staging",
  authDb:env.AUTH_DB,sessionSecret:env.QUOTATION_PRIVATE_SESSION_SECRET,
  expectedTenantId:env.QUOTATION_PRIVATE_TENANT_ID
 });
 const store=createQuotationDraftD1Store({db:env.QUOTE_DB});
 const logoStore=createQuotationLogoStore({db:env.QUOTE_DB,bucket:env.LOGO_R2});
 const tenantId=env.QUOTATION_PRIVATE_TENANT_ID;
 const roles=new Set(["owner","admin","manager"]);
 const authority=Object.freeze({
  async assertPrivatePreview({actor,companyId,mode}={}){
   return mode==="synthetic-preview"&&companyId===tenantId&&
     actor?.tenantId===tenantId&&roles.has(actor.role)&&
     (await verifier.verifyActiveMembership({
       actor,tenantId:companyId,userId:actor.userId
     }))?.active===true;
  }
 });
 const secret=env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET;
 return createFinalLovelyPrivatePdfPreviewHost({
   enabled:true,expectedTenantId:tenantId,
   allowedPrivateOrigin:env.QUOTATION_PRIVATE_ORIGIN,
   readVerifiedSession:verifier.readVerifiedSession,
   verifyActiveMembership:verifier.verifyActiveMembership,
   verifyMutation:verifier.verifyMutation,
   verifyPrivateInvocation:async({request})=>
     request instanceof Request&&
     sameSecret(secret,request.headers.get("x-quotation-private-caller")),
   draftStore:store,logoStore,authority,
   browserBinding:env.QUOTATION_BROWSER,launchBrowser,pdfLib
 });
}
// Do not add a default Worker fetch export. Staging remains unmounted.
