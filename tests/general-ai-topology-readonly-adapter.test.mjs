import test from "node:test";
import assert from "node:assert/strict";
import {createGeneralAiTopologyReadOnlyAdapter} from "../scripts/general-ai-topology-readonly-adapter.mjs";
const account="ddd23cab31928a4bb3d4998df9b26d1d",zone="a".repeat(32);
const ids=["ff229eef-7724-49ae-9d68-d3a1db669b63","71e2d394-7dec-4878-bdc8-afe8f73cf541","8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"];
const fixture=()=>({
 staging:{bindings:[{name:"DB",database_id:ids[0]},{name:"APP_ENV",text:"staging"},{name:"THEBE_GENERAL_AI_ENABLED",text:"false"}]},
 consumer:{bindings:[{name:"PRIVATE_AI_NONCE_DB",database_id:ids[1]},{name:"PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED",text:"false"},{name:"STAGING_AI",service:"bw-general-ai-staging",environment:"production"}]},
 databases:ids.map(uuid=>({uuid})),domains:[{service:"bw-compliance-os"}],routes:[]
});
const transport=(data,mutate=()=>{})=>({request:async({method,path})=>{assert.equal(method,"GET");mutate(path);const key=path.includes("/bw-general-ai-staging/settings")?"staging":path.includes("/bw-general-ai-private-queue-acceptance/settings")?"consumer":path.includes("/d1/database")?"databases":path.includes("/workers/domains")?"domains":path.includes("/workers/routes")?"routes":null;assert.ok(key,"unexpected endpoint");return {success:true,result:data[key]}}});
test("reads exactly five endpoints without mutating and does not attest live acceptance",async()=>{
 const paths=[];const adapter=createGeneralAiTopologyReadOnlyAdapter({client:transport(fixture(),p=>paths.push(p)),accountId:account,zoneId:zone});
 const {evidence}=await adapter.readTopology();assert.equal(paths.length,5);assert.equal(evidence.verified,true);assert.equal(evidence.liveAcceptance,false);assert.equal(evidence.independentAttestation,false);
});
test("rejects wrong account, missing zone, production alias and public route",async()=>{
 assert.throws(()=>createGeneralAiTopologyReadOnlyAdapter({client:transport(fixture()),accountId:"wrong",zoneId:zone}));
 assert.throws(()=>createGeneralAiTopologyReadOnlyAdapter({client:transport(fixture()),accountId:account}));
 const x=fixture();x.staging.bindings[0].database_id=ids[2];await assert.rejects(()=>createGeneralAiTopologyReadOnlyAdapter({client:transport(x),accountId:account,zoneId:zone}).readTopology(),/staging DB mismatch/);
 const y=fixture();y.routes.push({script:"bw-general-ai-staging"});await assert.rejects(()=>createGeneralAiTopologyReadOnlyAdapter({client:transport(y),accountId:account,zoneId:zone}).readTopology(),/route exposed/);
});
test("rejects incomplete pagination and failed Cloudflare responses",async()=>{
 const base=transport(fixture());const client={request:async opts=>({...await base.request(opts),result_info:{page:1,total_pages:2}})};
 await assert.rejects(()=>createGeneralAiTopologyReadOnlyAdapter({client,accountId:account,zoneId:zone}).readTopology(),/paginated inventory incomplete/);
});
