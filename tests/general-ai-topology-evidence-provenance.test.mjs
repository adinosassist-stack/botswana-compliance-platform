import test from "node:test";
import assert from "node:assert/strict";
import {buildGeneralAiTopologyEvidence as build} from "../scripts/general-ai-topology-evidence-provenance.mjs";
const sourceSha="a".repeat(40),zoneId="33e363d52b69c4a64dbb8a0891dbb3a9",observedAt="2026-11-08T14:00:00Z";
const db=["ff229eef-7724-49ae-9d68-d3a1db669b63","71e2d394-7dec-4878-bdc8-afe8f73cf541","8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"];
const fixture=()=>({sourceSha,zoneId,observedAt,snapshot:{stagingBindings:[{name:"DB",database_id:db[0]},{name:"APP_ENV",text:"staging"},{name:"THEBE_GENERAL_AI_ENABLED",text:"false"}],queueBindings:[{name:"PRIVATE_AI_NONCE_DB",database_id:db[1]},{name:"PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED",text:"false"},{name:"STAGING_AI",service:"bw-general-ai-staging",environment:"production"}],databases:db.map(uuid=>({uuid})),routes:[],domains:[]}});
test("source-bound evidence cannot masquerade as live acceptance or reviewer approval",()=>{const r=build(fixture());assert.equal(r.checks.verified,true);assert.equal(r.readOnly,true);assert.equal(r.reviewerApproved,false);assert.equal(r.independentAttestation,false);assert.equal(r.liveQueueDeliveryVerified,false)});
test("rejects missing SHA, wrong zone and invalid observation timestamp",()=>{for(const mutate of [x=>x.sourceSha="latest",x=>x.zoneId="wrong",x=>x.observedAt="tomorrow"]){const x=fixture();mutate(x);assert.throws(()=>build(x))}});
test("rejects customer production DB binding and public routes",()=>{const x=fixture();x.snapshot.stagingBindings[0].database_id=db[2];assert.throws(()=>build(x));const y=fixture();y.snapshot.routes.push({script:"bw-general-ai-staging"});assert.throws(()=>build(y))});
