/**
 * C4 external-customer quotation activation readiness (pure evidence checker).
 * No connector calls, credentials, deployments or customer data mutations.
 * Passing synthetic evidence NEVER authorizes a Cloudflare/Google write.
 */
export const C4_CUSTOMER_RESOURCE_LOCK = Object.freeze({
 accountId:"ddd23cab31928a4bb3d4998df9b26d1d",
 databaseId:"56f48000-9d89-47d5-a077-47dfe0825662",
 databaseName:"bw-essentials-customer-consent-private-staging",
 workerName:"bw-customer-quotation-identity-private-staging",
 stagingEnvironment:"essentials-private-staging"
});
const sha40=x=>typeof x==="string" && /^[0-9a-f]{40}$/.test(x);
const sha64=x=>typeof x==="string" && /^[0-9a-f]{64}$/.test(x);
const host=x=>{
 try {const u=new URL(x);return u.protocol==="https:" &&
  u.origin===x && !u.username && !u.password && !u.search && !u.hash}
 catch{return false}
};
export function assessCustomerQuotationPrivateReadiness({
 mainSha,reviewedSha,sourceDigest,inventory,identity,customerAuthority,
 approvals,qualification
}={}){
 const missing=[];
 const need=(condition,key)=>{if(!condition)missing.push(key)};
 need(sha40(mainSha)&&mainSha===reviewedSha,"exact_source_review_missing");
 need(sha64(sourceDigest),"source_manifest_digest_missing");
 need(inventory?.accountId===C4_CUSTOMER_RESOURCE_LOCK.accountId,
  "cloudflare_account_unverified");
 need(inventory?.database?.id===C4_CUSTOMER_RESOURCE_LOCK.databaseId &&
  inventory.database?.name===C4_CUSTOMER_RESOURCE_LOCK.databaseName &&
  inventory.database?.schemaAttested===true,"isolated_d1_schema_unattested");
 need(inventory?.database?.backupRestoreAccepted===true,
  "staging_recovery_unaccepted");
 need(inventory?.worker?.name===C4_CUSTOMER_RESOURCE_LOCK.workerName &&
  inventory.worker?.compiledSourceDigest===sourceDigest &&
  inventory.worker?.bindingsVerified===true,
  "customer_worker_version_unverified");
 need(inventory?.worker?.workersDev===false &&
  inventory.worker?.previewUrls===false &&
  Array.isArray(inventory.worker?.routes)&&
  inventory.worker.routes.length===0,
  "public_worker_entrypoint_detected");
 need(host(inventory?.protectedHost)&&
  inventory?.access?.policyVerified===true &&
  inventory.access?.privateOnly===true &&
  inventory.access?.host===inventory.protectedHost,
  "protected_host_access_unverified");
 need(identity?.issuerPinned===true &&
  identity?.clientRegistered===true &&
  identity?.confidentialExchangeVerified===true &&
  identity?.jwksRotationReviewed===true,
  "real_customer_oidc_missing");
 need(customerAuthority?.independentOwnershipVerifier===true &&
  customerAuthority?.trustedInvitationDelivery===true &&
  customerAuthority?.frozenQuoteAndFullTerms===true,
  "customer_ownership_and_quote_authority_missing");
 need(qualification?.syntheticInviteLoginQuoteAcceptance===true &&
  qualification?.crossTenantCsrfReplayRevocationNegative===true &&
  qualification?.mobileAccessibilityAndRecovery===true,
  "synthetic_e2e_unqualified");
 need(approvals?.ownerExactSource===true &&
  approvals?.independentThusicoExactSource===true &&
  approvals?.stagingOperationsAuthorized===true,
  "independent_staging_approvals_missing");
 const blockers=Object.freeze([...new Set(missing)]);
 return Object.freeze({
  mode:"READ_ONLY_SOURCE_EVIDENCE",
  sourceSha:mainSha||null,
  blockers,
  privateStagingEvidenceComplete:blockers.length===0,
  workerUploadAuthorized:false,
  privateStagingDeployAuthorized:false,
  publicCustomerLoginAuthorized:false,
  productionActivationAuthorized:false
 });
}
