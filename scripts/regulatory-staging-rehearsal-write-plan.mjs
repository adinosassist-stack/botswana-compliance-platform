// Offline rehearsal write-plan builder. It NEVER performs I/O, SQL or authorization.
import {createSyntheticRegulatoryFixtureManifest,verifySyntheticRegulatoryFixtureManifest} from "./regulatory-staging-fixture-manifest.mjs";
import {validateRegulatoryRehearsalAuthorization} from "./regulatory-staging-write-authorization.mjs";
export function prepareRegulatoryStagingWritePlan(input={}){
 const refuse=reason=>({ok:false,decision:"refused",reason});
 const authorization=validateRegulatoryRehearsalAuthorization(input.authorization);
 if(!authorization.ok)return refuse(authorization.reason);
 const {manifest,sha256}=createSyntheticRegulatoryFixtureManifest();
 const verified=verifySyntheticRegulatoryFixtureManifest(manifest,input.authorization.approvedFixtureManifestSha256);
 if(!verified.ok||input.authorization.fixtureManifestSha256!==sha256)return refuse("fixture_manifest_mismatch");
 if(input.expectedExistingRecords!==0||input.baselineAttestationAccepted!==true||
    input.freshReadOnlyEvidence!==true)return refuse("baseline_not_independently_qualified");
 // Approval in an offline object is NOT proof of the GitHub protected deployment reviewer.
 // No executable SQL or remote staging operation is returned.
 return {ok:true,decision:"human_execution_authorization_still_required",
   scope:"synthetic-staging-rehearsal-only",fixtureDigest:sha256,
   counts:{tenants:manifest.tenants.length,historicalVat:manifest.historicalVat.length,
     schedules:manifest.schedules.length,rules:manifest.rules.length},
   remoteWriteAuthorized:false,sqlGenerated:false,requiresSeparateProtectedWorkflow:true};
}
