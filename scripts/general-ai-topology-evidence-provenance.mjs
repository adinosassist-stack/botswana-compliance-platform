import assert from "node:assert/strict";
import {verifyGeneralAiStagingTopology} from "./general-ai-staging-topology-guard.mjs";
const SHA=/^[a-f0-9]{40}$/;
const EXPECTED_ZONE="33e363d52b69c4a64dbb8a0891dbb3a9";
/** Read-only provenance receipt; never represents protected reviewer approval. */
export function buildGeneralAiTopologyEvidence({sourceSha,zoneId,observedAt,snapshot}={}){
 assert.match(sourceSha??"",SHA,"exact source SHA required");
 assert.equal(zoneId,EXPECTED_ZONE,"unexpected zone ID");
 assert.match(observedAt??"",/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/,"UTC observation timestamp required");
 assert.ok(Number.isFinite(Date.parse(observedAt)),"invalid observation timestamp");
 const result=verifyGeneralAiStagingTopology(snapshot);
 return Object.freeze({sourceSha,zoneId,observedAt,checks:result,readOnly:true,reviewerApproved:false,independentAttestation:false,liveQueueDeliveryVerified:false,productionAiEnabled:false});
}
