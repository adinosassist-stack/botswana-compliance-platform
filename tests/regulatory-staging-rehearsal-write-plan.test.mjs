import test from "node:test";
import assert from "node:assert/strict";
import {createSyntheticRegulatoryFixtureManifest} from "../scripts/regulatory-staging-fixture-manifest.mjs";
import {prepareRegulatoryStagingWritePlan as prepare} from "../scripts/regulatory-staging-rehearsal-write-plan.mjs";
const digest=createSyntheticRegulatoryFixtureManifest().sha256;
const auth=()=>({
 confirmation:"AUTHORIZE_SYNTHETIC_STAGING_REHEARSAL",environment:"regulatory-staging",ref:"refs/heads/main",
 expectedSha:"a".repeat(40),checkoutSha:"a".repeat(40),liveMainSha:"a".repeat(40),
 stagingId:"20c0d37e-552e-438f-a56d-3f12c27d38e2",productionId:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",
 stagingName:"bw-compliance-os-regulatory-staging",verifiedRemoteName:"bw-compliance-os-regulatory-staging",
 verifiedRemoteId:"20c0d37e-552e-438f-a56d-3f12c27d38e2",dataset:"synthetic-only",
 containsRealTenants:false,fixtureManifestSha256:digest,approvedFixtureManifestSha256:digest,
 independentReviewerApproved:true,reviewerId:"checker",operatorId:"maker",
 noConcurrentWriter:true,recoveryVerified:true,beforeStateVerified:true,noAutoApproval:true,noProductionWrite:true
});
const base=()=>({authorization:auth(),expectedExistingRecords:0,baselineAttestationAccepted:true,freshReadOnlyEvidence:true});
test("offline plan never authorizes remote writes",()=>{
 const result=prepare(base());assert.equal(result.ok,true);
 assert.equal(result.remoteWriteAuthorized,false);assert.equal(result.sqlGenerated,false);
 assert.equal(result.decision,"human_execution_authorization_still_required");
 assert.deepEqual(result.counts,{tenants:2,historicalVat:2,schedules:2,rules:2});
});
test("every missing or inconsistent gate refuses the plan",()=>{
 for(const [key,value] of [["expectedExistingRecords",1],["baselineAttestationAccepted",false],["freshReadOnlyEvidence",false]]){
 assert.equal(prepare({...base(),[key]:value}).ok,false,key);
 }
 for(const [key,value] of [["liveMainSha","b".repeat(40)],["approvedFixtureManifestSha256","c".repeat(64)],
 ["independentReviewerApproved",false],["noConcurrentWriter",false],["noProductionWrite",false]]){
 assert.equal(prepare({...base(),authorization:{...auth(),[key]:value}}).ok,false,key);
 }
 assert.equal(prepare({}).ok,false);
});
