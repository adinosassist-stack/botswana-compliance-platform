import test from "node:test";
import assert from "node:assert/strict";
import {assessQuotationPrivateOperationalGate as assess} from "../scripts/quotation-private-operational-gate.mjs";
const verified=()=>({
 accountId:"ddd23cab31928a4bb3d4998df9b26d1d",
 exactMainSha:"812350c01bbdd5cd550c4e81ac2f1cac29067b5d",
 currentMainSha:"812350c01bbdd5cd550c4e81ac2f1cac29067b5d",
 compiledSha256:"09eed552bc5ef79ff3ca6b5b57e56453c0a2326e330968d47dcab39937e93274",
 bundleManifestSha256:"870b418aaa9c3dc8b17bc562b71f40999875a43aff74bc5d97257e721a195b67",
 ownerApproval:{author:"adinosassist-stack",commentId:6937858184},
 reviewerApproval:{author:"thusico",commentId:6937902083},
 worker:{name:"bw-quotation-auth-private-staging",deployed_on:null,
  public:false,preview:false,workerReferences:0,domainReferences:0,
  versions:[{id:"cc20de6e-ab08-409f-89a1-390e0eaf5be1",
   module:"quotation-private-bootstrap-deny-all.mjs",urls:[]}]},
 plannedBindings:[
  {name:"AUTH_DB",type:"d1",resource:"d7ad8e99-2ee4-446c-9358-0e186031571d"},
  {name:"QUOTE_DB",type:"d1",resource:"aec227e9-b0f2-4b00-8de0-105465c4e2d6"},
  {name:"LOGO_R2",type:"r2",resource:"bw-quotation-logo-private-staging"},
  {name:"TEMPLATE_R2",type:"r2",resource:"bw-quotation-template-private-staging"}
 ],
 manifest:{workers_dev:false,preview_urls:false,routes:[]},
 protectedSecrets:{
  QUOTATION_PRIVATE_SESSION_SECRET:{configured:true,independentlyVerified:true},
  QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:{configured:true,independentlyVerified:true},
  distinctValuesVerified:true,exposedInLogs:false
 },
 syntheticTenant:{uuidVerified:true,noRealCustomerData:true},
 privateCaller:{separateAuthorizedWorker:true,serviceBindingVerified:true,
  noPublicOrPreviewRoutes:true},
 recovery:{bootstrapVersionRetained:true,readOnlyCheckpointCaptured:true,
  rollbackProcedureTested:true},
 evidenceSource:"independent-authenticated-preflight",readOnlyVerified:true
});
test("complete independently substantiated staging evidence is eligible, never a deployment authority",()=>{
 const result=assess(verified());
 assert.equal(result.eligibleForSeparatelyControlledStagingExecution,true);
 assert.deepEqual(result.failures,[]);
 assert.equal(result.workerUploadExecuted,false);
 assert.equal(result.workerDeployed,false);
 assert.equal(result.customerActivationAuthorized,false);
});
test("owner and reviewer SHA/digests or source changes deny readiness",()=>{
 for(const change of [
  e=>e.currentMainSha="a".repeat(40),
  e=>e.compiledSha256="b".repeat(64),
  e=>e.bundleManifestSha256="c".repeat(64),
  e=>e.ownerApproval.commentId=1,
  e=>e.reviewerApproval.author="owner"
 ]){const e=verified();change(e);assert.equal(assess(e).eligibleForSeparatelyControlledStagingExecution,false)}
});
test("missing protected secrets, unapproved caller, unchecked restore or public route fail closed",()=>{
 for(const change of [
  e=>{delete e.protectedSecrets.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET},
  e=>{e.protectedSecrets.distinctValuesVerified=false},
  e=>{e.privateCaller.serviceBindingVerified=false},
  e=>{delete e.privateCaller},
  e=>{e.recovery.rollbackProcedureTested=false},
  e=>{e.manifest.routes=["thebedesk.com/*"]},
  e=>{e.worker.preview=true},
  e=>{e.worker.workerReferences=1},
  e=>{e.worker.versions.push({id:"extra"})},
  e=>{e.plannedBindings[0].resource="production-db"},
  e=>{e.plannedBindings.push({...e.plannedBindings[0]})},
  e=>{e.evidenceSource="unverified-comment"}
 ]){const e=verified();change(e);
  assert.equal(assess(e).eligibleForSeparatelyControlledStagingExecution,false);
  assert.ok(assess(e).failures.length>0)}
});
test("fresh observed undeployed Worker with no bindings and no caller is NOT qualified",()=>{
 const e=verified();
 e.protectedSecrets={};
 e.privateCaller={};
 e.recovery={bootstrapVersionRetained:true,readOnlyCheckpointCaptured:false,rollbackProcedureTested:false};
 const result=assess(e);
 assert.equal(result.eligibleForSeparatelyControlledStagingExecution,false);
 assert.ok(result.failures.includes("protected_secrets_not_verified"));
 assert.ok(result.failures.includes("independent_private_caller_missing"));
 assert.ok(result.failures.includes("recovery_not_qualified"));
});
