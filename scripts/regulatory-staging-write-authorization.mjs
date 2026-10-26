// Pure, fail-closed authorization gate for a future separately reviewed staging writer.
// Intentionally performs no network requests, SQL, or credential retrieval.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const NAME=/(?:^|[-_])(staging|sandbox|evaluation|test)(?:$|[-_])/i;
export const STAGING_WRITE_CONFIRMATION="AUTHORIZE_SYNTHETIC_STAGING_REHEARSAL";
export function validateRegulatoryRehearsalAuthorization(input={}){
  const fail=reason=>({ok:false,reason});
  if(input.confirmation!==STAGING_WRITE_CONFIRMATION)return fail("confirmation_missing");
  if(input.environment!=="regulatory-staging"||input.ref!=="refs/heads/main")return fail("protected_environment_required");
  if(!SHA.test(String(input.expectedSha||""))||input.expectedSha!==input.checkoutSha||
    input.expectedSha!==input.liveMainSha)return fail("main_revision_mismatch");
  if(!UUID.test(String(input.stagingId||""))||!UUID.test(String(input.productionId||""))||
    input.stagingId.toLowerCase()===input.productionId.toLowerCase())return fail("production_exclusion_failed");
  if(!NAME.test(String(input.stagingName||""))||input.stagingName==="bw-compliance-os"||
    input.verifiedRemoteName!==input.stagingName||
    String(input.verifiedRemoteId||"").toLowerCase()!==input.stagingId.toLowerCase())
    return fail("staging_identity_unverified");
  if(input.dataset!=="synthetic-only"||input.containsRealTenants!==false)return fail("non_synthetic_data_forbidden");
  if(!DIGEST.test(String(input.fixtureManifestSha256||""))||
    !DIGEST.test(String(input.approvedFixtureManifestSha256||""))||
    input.fixtureManifestSha256!==input.approvedFixtureManifestSha256)
    return fail("fixture_manifest_unapproved");
  const reviewer=typeof input.reviewerId==="string"?input.reviewerId.trim().toLowerCase():"";
  const operator=typeof input.operatorId==="string"?input.operatorId.trim().toLowerCase():"";
  if(input.independentReviewerApproved!==true||!reviewer||!operator||reviewer===operator)
    return fail("independent_authorization_required");
  if(input.noConcurrentWriter!==true||input.recoveryVerified!==true||
    input.beforeStateVerified!==true)return fail("staging_safety_prerequisite_missing");
  if(input.noAutoApproval!==true||input.noProductionWrite!==true)
    return fail("regulatory_gate_missing");
  return {ok:true,scope:"synthetic-staging-rehearsal-only"};
}
