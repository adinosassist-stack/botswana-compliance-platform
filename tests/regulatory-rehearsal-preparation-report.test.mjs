import test from "node:test";
import assert from "node:assert/strict";
import {createRehearsalPreparationReport} from "../scripts/regulatory-rehearsal-preparation-report.mjs";
import {createSyntheticRegulatoryFixtureManifest} from "../scripts/regulatory-staging-fixture-manifest.mjs";
const hash=createSyntheticRegulatoryFixtureManifest().sha256;
const authorization=()=>({
 confirmation:"AUTHORIZE_SYNTHETIC_STAGING_REHEARSAL",environment:"regulatory-staging",ref:"refs/heads/main",
 expectedSha:"a".repeat(40),checkoutSha:"a".repeat(40),liveMainSha:"a".repeat(40),
 stagingId:"20c0d37e-552e-438f-a56d-3f12c27d38e2",productionId:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",
 stagingName:"bw-compliance-os-regulatory-staging",verifiedRemoteName:"bw-compliance-os-regulatory-staging",
 verifiedRemoteId:"20c0d37e-552e-438f-a56d-3f12c27d38e2",dataset:"synthetic-only",
 containsRealTenants:false,fixtureManifestSha256:hash,approvedFixtureManifestSha256:hash,
 independentReviewerApproved:true,reviewerId:"checker",operatorId:"maker",
 noConcurrentWriter:true,recoveryVerified:true,beforeStateVerified:true,noAutoApproval:true,noProductionWrite:true
});
test("report denies remote execution even with all offline input gates satisfied",()=>{
 const report=createRehearsalPreparationReport({authorization:authorization(),expectedExistingRecords:0,baselineAttestationAccepted:true,freshReadOnlyEvidence:true});
 assert.equal(report.result,"requires_independent_write_authorization");
 assert.equal(report.remoteWriteAuthorized,false);
 assert.equal(report.sqlGenerated,false);
 assert.equal(report.productionActivationAuthorized,false);
 assert.equal(report.fixtureDigest,hash);
 assert.deepEqual(report.counts,{tenants:2,historicalVat:2,schedules:2,rules:2});
});
test("invalid or missing input yields a bounded blocked report",()=>{
 for(const input of [{},{authorization:authorization(),expectedExistingRecords:1,baselineAttestationAccepted:true,freshReadOnlyEvidence:true}]){
  const report=createRehearsalPreparationReport(input);
  assert.equal(report.result,"blocked");assert.equal(report.fixtureDigest,null);
  assert.equal(report.remoteWriteAuthorized,false);assert.equal(report.sqlGenerated,false);
  assert.equal(report.productionActivationAuthorized,false);
  assert.ok(!JSON.stringify(report).includes("20c0d37e-552e-438f-a56d-3f12c27d38e2"));
 }
});
