import test from "node:test";
import assert from "node:assert/strict";
import {validateRegulatoryRehearsalAuthorization as validate,STAGING_WRITE_CONFIRMATION as CONFIRM} from "../scripts/regulatory-staging-write-authorization.mjs";
const base=()=>({
 confirmation:CONFIRM,environment:"regulatory-staging",ref:"refs/heads/main",
 expectedSha:"a".repeat(40),checkoutSha:"a".repeat(40),liveMainSha:"a".repeat(40),
 stagingId:"20c0d37e-552e-438f-a56d-3f12c27d38e2",
 productionId:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",
 stagingName:"bw-compliance-os-regulatory-staging",verifiedRemoteName:"bw-compliance-os-regulatory-staging",
 verifiedRemoteId:"20c0d37e-552e-438f-a56d-3f12c27d38e2",
 dataset:"synthetic-only",containsRealTenants:false,
 fixtureManifestSha256:"b".repeat(64),approvedFixtureManifestSha256:"b".repeat(64),
 independentReviewerApproved:true,reviewerId:"checker",operatorId:"maker",
 noConcurrentWriter:true,recoveryVerified:true,beforeStateVerified:true,
 noAutoApproval:true,noProductionWrite:true
});
test("complete scoped authorization permits only a synthetic rehearsal",()=>assert.deepEqual(validate(base()),{ok:true,scope:"synthetic-staging-rehearsal-only"}));
test("every mandatory control is fail closed",()=>{
 const mutations=[
 ["confirmation","DO_NOT_RUN"],["environment","production"],["ref","refs/heads/feature"],
 ["expectedSha","c".repeat(40)],["checkoutSha","c".repeat(40)],["liveMainSha","c".repeat(40)],
 ["stagingId","8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"],["productionId","20c0d37e-552e-438f-a56d-3f12c27d38e2"],
 ["stagingName","bw-compliance-os"],["verifiedRemoteName","other-staging"],
 ["verifiedRemoteId","00000000-0000-4000-8000-000000000000"],
 ["dataset","production-clone"],["containsRealTenants",true],
 ["fixtureManifestSha256","c".repeat(64)],["approvedFixtureManifestSha256","c".repeat(64)],
 ["independentReviewerApproved",false],["reviewerId","maker"],["operatorId","checker"],
 ["noConcurrentWriter",false],["recoveryVerified",false],["beforeStateVerified",false],
 ["noAutoApproval",false],["noProductionWrite",false]
 ];
 for(const [key,value] of mutations){const result=validate({...base(),[key]:value});assert.equal(result.ok,false,key);}
 assert.equal(validate().ok,false);
});

test("independent reviewer identity rejects case, whitespace and empty aliases",()=>{
 for(const [reviewerId,operatorId] of [[" Maker ","maker"],["MAKER","maker"],[" ","maker"],["checker","  "]]){
  assert.equal(validate({...base(),reviewerId,operatorId}).ok,false,JSON.stringify([reviewerId,operatorId]));
 }
});
