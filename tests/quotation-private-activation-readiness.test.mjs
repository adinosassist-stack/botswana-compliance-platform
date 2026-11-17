import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkQuotationPrivateRehearsal} from "../scripts/quotation-private-activation-readiness.mjs";
const main="1e268c846fa4023daf1044198f4be1d4772cc885";
const manifests={
 service:readFileSync(new URL("../deploy/quotation-private-staging/wrangler.jsonc",import.meta.url),"utf8"),
 caller:readFileSync(new URL("../deploy/quotation-synthetic-private-caller/wrangler.jsonc",import.meta.url),"utf8"),
 harness:readFileSync(new URL("../deploy/quotation-private-workflow-harness/wrangler.jsonc",import.meta.url),"utf8")
};
const inventory={
 source:"cloudflare-read-only-get",accountId:"ddd23cab31928a4bb3d4998df9b26d1d",
 exactMainSha:main,
 resources:{
 authD1:{exists:true,id:"d7ad8e99-2ee4-446c-9358-0e186031571d"},
 quoteD1:{exists:true,id:"aec227e9-b0f2-4b00-8de0-105465c4e2d6"},
 logoR2:{exists:true,name:"bw-quotation-logo-private-staging"},
 templateR2:{exists:true,name:"bw-quotation-template-private-staging"}
 },
 scripts:{
 "bw-quotation-auth-private-staging":{exists:true,publicRoutes:0,workersDev:false,previewUrls:false,bindingsVerified:true,requiredSecretsPresent:true},
 "bw-quotation-synthetic-caller-staging":{exists:true,publicRoutes:0,workersDev:false,previewUrls:false,bindingsVerified:true,requiredSecretsPresent:true},
 "bw-quotation-private-workflow-harness":{exists:true,publicRoutes:0,workersDev:false,previewUrls:false,bindingsVerified:true,requiredSecretsPresent:true}
 },
 privateInvocationIndependentlyVerified:true,isolatedRestoreTested:true
};
const artifacts={
 caller:{sourceSha:main,manifestSha256:"a".repeat(64),mode:"OFFLINE_BUILD_ONLY"},
 harness:{sourceSha:main,manifestSha256:"b".repeat(64),mode:"OFFLINE_BUILD_ONLY"}
};
const approvals={ownerExactArtifact:true,thusicoExactArtifact:true};
const evaluate=(overrides={})=>checkQuotationPrivateRehearsal({
 mainSha:main,approvedMainSha:main,manifests,inventory,artifacts,approvals,...overrides
});
test("complete test evidence is never itself deployment authorization",()=>{
 const result=evaluate();
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.evidenceComplete,true);
 assert.equal(result.deployAuthorized,false);
 assert.equal(result.workflowExecutionAuthorized,false);
 assert.equal(result.publicLaunchAuthorized,false);
});
test("missing real caller and harness are actionable blockers",()=>{
 const observed=structuredClone(inventory);
 observed.scripts["bw-quotation-synthetic-caller-staging"]={exists:false};
 observed.scripts["bw-quotation-private-workflow-harness"]={exists:false};
 const res=evaluate({inventory:observed});
 assert.equal(res.evidenceComplete,false);
 assert.ok(res.blockers.includes("bw-quotation-synthetic-caller-staging_absent"));
 assert.ok(res.blockers.includes("bw-quotation-private-workflow-harness_absent"));
});
test("PR build receipts are not accepted as merged-main artifacts",()=>{
 const copy=structuredClone(artifacts);copy.caller.sourceSha="4e3be5a1d2dd03959b29e8cf6d2326ba91048533";
 assert.ok(evaluate({artifacts:copy}).blockers.includes("caller_main_binary_receipt_missing"));
});
test("privacy, binding, recovery and independent approval cannot be inferred",()=>{
 const obs=structuredClone(inventory);
 obs.scripts["bw-quotation-auth-private-staging"].publicRoutes=1;
 obs.scripts["bw-quotation-private-workflow-harness"].bindingsVerified=false;
 obs.isolatedRestoreTested=false;
 const res=evaluate({inventory:obs,approvals:{ownerExactArtifact:true,thusicoExactArtifact:false}});
 for(const blocker of ["bw-quotation-auth-private-staging_privacy_unverified","bw-quotation-private-workflow-harness_bindings_unverified","recovery_not_tested","operational_approvals_missing"]){
  assert.ok(res.blockers.includes(blocker),blocker);
 }
});
test("source mismatch and tampered manifest rejected",()=>{
 assert.ok(evaluate({approvedMainSha:"0".repeat(40)}).blockers.includes("exact_main_not_reviewed"));
 const bad={...manifests,harness:manifests.harness.replace('"workers_dev": false','"workers_dev": true')};
 assert.ok(evaluate({manifests:bad}).blockers.includes("harness_public_endpoint"));
});
