import test from "node:test";
import assert from "node:assert/strict";
import {verifyGeneralAiStagingTopology as verify} from "../scripts/general-ai-staging-topology-guard.mjs";
const stagingBindings=[{name:"DB",database_id:"ff229eef-7724-49ae-9d68-d3a1db669b63"},{name:"APP_ENV",text:"staging"},{name:"THEBE_GENERAL_AI_ENABLED",text:"false"}];
const queueBindings=[{name:"PRIVATE_AI_NONCE_DB",database_id:"71e2d394-7dec-4878-bdc8-afe8f73cf541"},{name:"PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED",text:"false"},{name:"STAGING_AI",service:"bw-general-ai-staging",environment:"production"}];
const databases=["ff229eef-7724-49ae-9d68-d3a1db669b63","71e2d394-7dec-4878-bdc8-afe8f73cf541","8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"].map(uuid=>({uuid}));
const fixture=()=>({stagingBindings:structuredClone(stagingBindings),queueBindings:structuredClone(queueBindings),databases:structuredClone(databases),routes:[],domains:[{service:"bw-compliance-os"}]});
test("distinct staging D1 and no General AI routes is read-only evidence, not live approval",()=>{const r=verify(fixture());assert.equal(r.verified,true);assert.equal(r.liveAcceptance,false);assert.equal(r.independentAttestation,false)});
test("rejects staging database alias to production and missing database metadata",()=>{
 const a=fixture();a.stagingBindings[0].database_id="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce";assert.throws(()=>verify(a),/staging DB mismatch/);
 const b=fixture();b.databases=[];assert.throws(()=>verify(b),/database identity missing/);
});
test("rejects public routes, custom domains, enabled flags and wrong service",()=>{
 for(const mutate of [
 x=>x.routes.push({script:"bw-general-ai-staging",pattern:"example.com/*"}),
 x=>x.domains.push({service:"bw-general-ai-private-queue-acceptance"}),
 x=>x.stagingBindings[2].text="true",
 x=>x.queueBindings[1].text="true",
 x=>x.queueBindings[2].service="bw-compliance-os",
 ]){const x=fixture();mutate(x);assert.throws(()=>verify(x))}
});
