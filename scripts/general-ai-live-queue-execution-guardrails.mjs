import assert from "node:assert/strict";

const SHA=/^[a-f0-9]{40}$/;
const NONCE=/^[a-f0-9]{32}$/;
const EXACT_KEYS=["operation","worker","sourceSha","nonce"];
export function preparePrivateQueueTestEnvelope({sourceSha,nonce,authorization,approvedSourceSha,independentReview,environment,queue,consumerDisabled,productionEnabled}) {
 assert.match(sourceSha??"",SHA,"exact source SHA required");
 assert.equal(sourceSha,approvedSourceSha,"approved SHA mismatch");
 assert.equal(authorization,"AUTHORIZE_PRIVATE_STAGING_QUEUE_TEST","explicit separate test authorization required");
 assert.equal(independentReview,true,"independent review required");
 assert.equal(environment,"general-ai-private-staging");
 assert.equal(queue,"bw-general-ai-private-acceptance-queue");
 assert.equal(consumerDisabled,false,"staging-only consumer must be explicitly enabled in separately protected test");
 assert.equal(productionEnabled,false,"production must remain disabled");
 assert.match(nonce??"",NONCE,"fresh 32-hex nonce required");
 const envelope={operation:"verify-disabled",worker:"bw-general-ai-staging",sourceSha,nonce};
 assert.deepEqual(Object.keys(envelope),EXACT_KEYS);
 return Object.freeze(envelope);
}
export function prepareQueueRollbackCheck({consumerDisabled,publicRoutes,productionEnabled,sourceSha,approvedSourceSha}) {
 assert.match(sourceSha??"",SHA);
 assert.equal(sourceSha,approvedSourceSha);
 assert.equal(consumerDisabled,true,"consumer must be restored disabled");
 assert.equal(publicRoutes,0,"public routes forbidden");
 assert.equal(productionEnabled,false);
 return Object.freeze({consumerRestoredDisabled:true,sourceSha});
}
