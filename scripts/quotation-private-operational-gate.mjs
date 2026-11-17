/**
 * Exact-artifact quotation private staging operational readiness assessment.
 * Pure/offline only: input claims must be independently substantiated with
 * authenticated Cloudflare evidence. This is NOT upload/deploy permission.
 */
const pinned=Object.freeze({
 account:"ddd23cab31928a4bb3d4998df9b26d1d",
 source:"812350c01bbdd5cd550c4e81ac2f1cac29067b5d",
 worker:"bw-quotation-auth-private-staging",
 executable:"09eed552bc5ef79ff3ca6b5b57e56453c0a2326e330968d47dcab39937e93274",
 manifest:"870b418aaa9c3dc8b17bc562b71f40999875a43aff74bc5d97257e721a195b67",
 authDb:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDb:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logo:"bw-quotation-logo-private-staging",
 template:"bw-quotation-template-private-staging",
 bootstrap:"cc20de6e-ab08-409f-89a1-390e0eaf5be1"
});
const secretKeys=["QUOTATION_PRIVATE_SESSION_SECRET","QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET"];
const exactBindings=[
 ["AUTH_DB","d1",pinned.authDb],
 ["QUOTE_DB","d1",pinned.quoteDb],
 ["LOGO_R2","r2",pinned.logo],
 ["TEMPLATE_R2","r2",pinned.template]
];
const safeObject=x=>x&&typeof x==="object"&&!Array.isArray(x);
export function assessQuotationPrivateOperationalGate(evidence={}){
 const failures=[];
 const need=(valid,reason)=>{if(!valid)failures.push(reason)};
 need(evidence.accountId===pinned.account,"cloudflare_account_unverified");
 need(evidence.exactMainSha===pinned.source&&evidence.currentMainSha===pinned.source,
  "exact_source_changed");
 need(evidence.compiledSha256===pinned.executable&&
   evidence.bundleManifestSha256===pinned.manifest,"artifact_digest_unverified");
 need(evidence.ownerApproval?.author==="adinosassist-stack"&&
   evidence.ownerApproval?.commentId===6937858184,"owner_exact_artifact_approval_missing");
 need(evidence.reviewerApproval?.author==="thusico"&&
   evidence.reviewerApproval?.commentId===6937902083,"independent_approval_missing");
 const worker=evidence.worker;
 need(worker?.name===pinned.worker&&worker?.deployed_on===null&&
   worker?.public===false&&worker?.preview===false&&
   worker?.workerReferences===0&&worker?.domainReferences===0&&
   Array.isArray(worker?.versions)&&worker.versions.length===1&&
   worker.versions[0]?.id===pinned.bootstrap&&
   worker.versions[0]?.module==="quotation-private-bootstrap-deny-all.mjs"&&
   Array.isArray(worker.versions[0]?.urls)&&worker.versions[0].urls.length===0,
  "private_worker_state_unverified");
 const planned=evidence.plannedBindings;
 need(Array.isArray(planned)&&planned.length===exactBindings.length&&
   exactBindings.every(([name,type,id])=>
     planned.filter(b=>b?.name===name&&b.type===type&&b.resource===id).length===1),
  "planned_binding_identity_unverified");
 need(evidence.manifest?.workers_dev===false&&evidence.manifest?.preview_urls===false&&
   Array.isArray(evidence.manifest?.routes)&&evidence.manifest.routes.length===0,
  "private_manifest_config_unverified");
 const secrets=evidence.protectedSecrets;
 need(safeObject(secrets)&&secretKeys.every(key=>
   secrets[key]?.configured===true&&secrets[key]?.independentlyVerified===true)&&
   secrets?.distinctValuesVerified===true&&
   secrets?.exposedInLogs===false,
  "protected_secrets_not_verified");
 need(evidence.syntheticTenant?.uuidVerified===true&&
   evidence.syntheticTenant?.noRealCustomerData===true,
  "synthetic_tenant_unverified");
 need(evidence.privateCaller?.separateAuthorizedWorker===true&&
   evidence.privateCaller?.serviceBindingVerified===true&&
   evidence.privateCaller?.noPublicOrPreviewRoutes===true,
  "independent_private_caller_missing");
 need(evidence.recovery?.bootstrapVersionRetained===true&&
   evidence.recovery?.readOnlyCheckpointCaptured===true&&
   evidence.recovery?.rollbackProcedureTested===true,
  "recovery_not_qualified");
 need(evidence.evidenceSource==="independent-authenticated-preflight"&&
   evidence.readOnlyVerified===true,"independent_evidence_missing");
 return Object.freeze({
  qualification:"read-only-operational-evidence",
  eligibleForSeparatelyControlledStagingExecution:failures.length===0,
  failures:Object.freeze(failures),
  // Even an empty failure set is NOT a token for a Cloudflare mutation.
  workerUploadExecuted:false,workerDeployed:false,
  customerActivationAuthorized:false,publicRoutesAuthorized:false,
  requiredApprovalScope:"UPLOAD_AND_DEPLOY_ISOLATED_QUOTATION_DRAFT_STAGING_ONLY"
 });
}
