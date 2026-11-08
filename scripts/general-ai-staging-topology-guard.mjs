import assert from "node:assert/strict";
const IDS=Object.freeze({account:"ddd23cab31928a4bb3d4998df9b26d1d",production:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",auth:"ff229eef-7724-49ae-9d68-d3a1db669b63",nonce:"71e2d394-7dec-4878-bdc8-afe8f73cf541"});
/** Verify a fresh read-only Cloudflare topology snapshot, without issuing release attestation. */
export function verifyGeneralAiStagingTopology({stagingBindings,queueBindings,databases,routes,domains}={}){
 assert.ok(Array.isArray(stagingBindings)&&Array.isArray(queueBindings)&&Array.isArray(databases)&&Array.isArray(routes)&&Array.isArray(domains),"complete topology required");
 const binding=(xs,name)=>{const matches=xs.filter(x=>x.name===name);assert.equal(matches.length,1,"missing or duplicate "+name);return matches[0]};
 assert.equal(binding(stagingBindings,"DB").database_id,IDS.auth,"staging DB mismatch");
 assert.equal(binding(queueBindings,"PRIVATE_AI_NONCE_DB").database_id,IDS.nonce,"nonce DB mismatch");
 assert.notEqual(IDS.auth,IDS.production);
 assert.notEqual(IDS.nonce,IDS.production);
 assert.equal(binding(stagingBindings,"APP_ENV").text,"staging");
 assert.equal(binding(stagingBindings,"THEBE_GENERAL_AI_ENABLED").text,"false");
 assert.equal(binding(queueBindings,"PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED").text,"false");
 const service=binding(queueBindings,"STAGING_AI");
 assert.equal(service.service,"bw-general-ai-staging");
 assert.ok(["production","staging"].includes(service.environment),"unknown service binding environment");
 for(const id of [IDS.auth,IDS.nonce,IDS.production])assert.equal(databases.filter(x=>x.uuid===id).length,1,"database identity missing");
 for(const route of routes)assert.equal(["bw-general-ai-staging","bw-general-ai-private-queue-acceptance"].includes(route.script),false,"General AI route exposed");
 for(const domain of domains)assert.equal(["bw-general-ai-staging","bw-general-ai-private-queue-acceptance"].includes(domain.service),false,"General AI custom domain exposed");
 return Object.freeze({verified:true,readOnly:true,liveAcceptance:false,independentAttestation:false,serviceBindingEnvironment:service.environment,productionDatabaseDistinct:true,publicWorkerRoutes:0});
}
