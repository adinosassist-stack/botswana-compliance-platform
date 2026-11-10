import assert from "node:assert/strict";
const SHA=/^[a-f0-9]{40}$/;
const REF=/^[a-zA-Z0-9_.:/-]{8,256}$/;
const EXPECTED={accountId:"ddd23cab31928a4bb3d4998df9b26d1d",consumer:"bw-general-ai-private-queue-acceptance",service:"bw-general-ai-staging",queue:"bw-general-ai-private-acceptance-queue",nonceDb:"71e2d394-7dec-4878-bdc8-afe8f73cf541"};
/**
 * Validate independent, source-bound staging isolation evidence. Never
 * infer isolation from a service binding's environment string or self-claim.
 * Caller must obtain real attestation from the protected runner.
 */
export function validateStagingServiceIsolation({sourceSha,inventory,evidence}){
 assert.match(sourceSha??"",SHA,"exact source SHA required");
 assert.equal(inventory?.serviceBindingEnvironment==="production"||inventory?.serviceBindingEnvironment==="staging",true,"service environment must be explicitly known");
 assert.equal(inventory?.serviceIsolationAttested,false,"inventory cannot self-attest");
 assert.equal(evidence?.verified,true,"independent evidence not verified");
 assert.equal(evidence.scope,"general-ai-private-staging");
 assert.match(evidence.reference??"",REF,"redacted evidence reference required");
 assert.equal(evidence.sourceSha,sourceSha,"source SHA mismatch");
 assert.equal(evidence.accountId,EXPECTED.accountId);
 assert.equal(evidence.consumer,EXPECTED.consumer);
 assert.equal(evidence.service,EXPECTED.service);
 assert.equal(evidence.queue,EXPECTED.queue);
 assert.equal(evidence.nonceDb,EXPECTED.nonceDb);
 assert.equal(evidence.stagingOnly,true,"staging-only proof required");
 assert.equal(evidence.productionResourcesTouched,false,"production resources must not be touched");
 assert.equal(evidence.publicRoutes,0,"public route exposure forbidden");
 assert.equal(evidence.productionAiEnabled,false,"production AI must remain disabled");
 assert.equal(evidence.independentReviewer,"thusico","independent reviewer evidence required");
 assert.equal(evidence.reviewerApproved,true,"reviewer approval required");
 assert.match(evidence.protectedRunUrl??"",/^https:\/\/github\.com\/adinosassist-stack\/botswana-compliance-platform\/actions\/runs\/[1-9][0-9]*$/);
 assert.ok(evidence.reference!==evidence.protectedRunUrl,"distinct evidence reference required");
 return Object.freeze({verified:true,scope:"general-ai-private-staging",reference:evidence.reference,stagingOnly:true,productionResourcesTouched:false,sourceSha});
}
