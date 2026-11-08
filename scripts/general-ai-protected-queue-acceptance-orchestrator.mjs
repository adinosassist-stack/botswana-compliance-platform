import assert from "node:assert/strict";
import {preparePrivateQueueTestEnvelope,prepareQueueRollbackCheck} from "./general-ai-live-queue-execution-guardrails.mjs";
import {validateLiveQueueAcceptance,initialLiveQueueAcceptance} from "./general-ai-live-queue-acceptance-gate.mjs";

const SHA=/^[a-f0-9]{40}$/;
const REQUIRED=["inspect","enable","publish","verifyDelivery","verifyAck","verifyReplay","verifyRecovery","verifyIsolation","disable","verifyRollback"];
const EVIDENCE=/^[a-zA-Z0-9_.:/-]{8,256}$/;
function proof(value,label) {
 assert.ok(value && typeof value==="object",label+" evidence required");
 assert.equal(value.verified,true,label+" not verified");
 assert.match(value.reference??"",EVIDENCE,label+" redacted receipt required");
 return value.reference;
}
/**
 * Adapter-injected protected staging acceptance orchestration.
 * No default network adapter, Cloudflare credentials or live side effects.
 * Production is always out of scope; caller must supply an independently
 * reviewed, staging-only adapter and a separate protected workflow.
 */
export async function runProtectedPrivateQueueAcceptance({sourceSha,approvedSourceSha,authorization,independentReview,nonce,runUrl,adapter}) {
 assert.match(sourceSha??"",SHA);
 assert.equal(sourceSha,approvedSourceSha,"exact source SHA mismatch");
 assert.equal(authorization,"AUTHORIZE_PRIVATE_STAGING_QUEUE_TEST");
 assert.equal(independentReview,true);
 assert.match(runUrl??"",/^https:\/\/github\.com\/adinosassist-stack\/botswana-compliance-platform\/actions\/runs\/[1-9][0-9]*$/);
 for(const name of REQUIRED)assert.equal(typeof adapter?.[name],"function",name+" adapter required");
 const state=initialLiveQueueAcceptance(sourceSha);
 let enableAttempted=false,rollbackVerified=false,originalError=null;
 const receipts={};
 try {
  const baseline=await adapter.inspect();
  proof(baseline,"baseline");
  assert.equal(baseline.consumerDisabled,true);
  assert.equal(baseline.publicRoutes,0);
  assert.equal(baseline.productionEnabled,false);
  assert.equal(baseline.queue,"bw-general-ai-private-acceptance-queue");
  assert.equal(baseline.environment,"general-ai-private-staging");
  assert.equal(baseline.sourceSha,sourceSha);
  enableAttempted=true;
  proof(await adapter.enable({sourceSha}),"enable");
  const envelope=preparePrivateQueueTestEnvelope({sourceSha,approvedSourceSha,nonce,authorization,independentReview,environment:"general-ai-private-staging",queue:baseline.queue,consumerDisabled:false,productionEnabled:false});
  receipts.publish=proof(await adapter.publish(envelope),"publish");
  receipts.liveDeliveryVerified=proof(await adapter.verifyDelivery(),"delivery");
  receipts.liveAckVerified=proof(await adapter.verifyAck(),"ack");
  receipts.liveReplayVerified=proof(await adapter.verifyReplay(),"replay");
  receipts.recoveryVerified=proof(await adapter.verifyRecovery(),"recovery");
  receipts.d1IsolationVerified=proof(await adapter.verifyIsolation(),"isolation");
 } catch(error){originalError=error}
 finally {
  if(enableAttempted){
   try {
    proof(await adapter.disable(),"disable");
    const rollback=await adapter.verifyRollback();
    proof(rollback,"rollback");
    prepareQueueRollbackCheck({consumerDisabled:rollback.consumerDisabled,publicRoutes:rollback.publicRoutes,productionEnabled:rollback.productionEnabled,sourceSha,approvedSourceSha});
    rollbackVerified=true;
    receipts.consumerRestoredDisabled=rollback.reference;
   } catch(rollbackError) {
    throw new AggregateError(originalError?[originalError,rollbackError]:[rollbackError],"STAGING_ROLLBACK_NOT_VERIFIED: manual incident response required");
   }
  }
 }
 if(originalError)throw originalError;
 assert.equal(rollbackVerified,true,"rollback not verified");
 const record={...state,runUrl,...Object.fromEntries(Object.keys(receipts).filter(k=>k!=="publish").map(k=>[k,true])),evidence:Object.fromEntries(Object.entries(receipts).filter(([k])=>k!=="publish"))};
 validateLiveQueueAcceptance(record);
 return Object.freeze({accepted:true,sourceSha,runUrl,evidence:record.evidence});
}
