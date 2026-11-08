import assert from "node:assert/strict";
import {verifyInertPrivateQueueInventory} from "./general-ai-cloudflare-inventory-guard.mjs";
import {preparePrivateQueueTestEnvelope,prepareQueueRollbackCheck} from "./general-ai-live-queue-execution-guardrails.mjs";
import {validateLiveQueueAcceptance,initialLiveQueueAcceptance} from "./general-ai-live-queue-acceptance-gate.mjs";

const SHA=/^[a-f0-9]{40}$/;
const REQUIRED=["inspect","readInventory","enable","publish","verifyDelivery","verifyAck","verifyReplay","verifyRecovery","verifyIsolation","disable","verifyRollback"];
const EVIDENCE=/^[a-zA-Z0-9_.:/-]{8,256}$/;
const EVIDENCE_KEYS=["liveDeliveryVerified","liveAckVerified","liveReplayVerified","recoveryVerified","d1IsolationVerified","consumerRestoredDisabled"];
function proof(value,label) {
 assert.ok(value && typeof value==="object",label+" evidence required");
 assert.equal(value.verified,true,label+" not verified");
 assert.match(value.reference??"",EVIDENCE,label+" redacted receipt required");
 assert.equal(value.scope,"general-ai-private-staging",label+" wrong scope");
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
 const receiptReferences=new Set();
 const collect=(value,label)=>{const ref=proof(value,label);assert.equal(receiptReferences.has(ref),false,label+" reused evidence reference");receiptReferences.add(ref);return ref;};
 try {
  const baseline=await adapter.inspect();
  collect(baseline,"baseline");
  assert.equal(baseline.consumerDisabled,true);
  assert.equal(baseline.publicRoutes,0);
  assert.equal(baseline.productionEnabled,false);
  assert.equal(baseline.queue,"bw-general-ai-private-acceptance-queue");
  assert.equal(baseline.environment,"general-ai-private-staging");
  assert.equal(baseline.sourceSha,sourceSha);
  const inventory=verifyInertPrivateQueueInventory(await adapter.readInventory());
  assert.equal(inventory.flagsDisabled,true);
  assert.equal(inventory.serviceIsolationAttested,false);
  // The live adapter must independently attest that the bound service is
  // staging-only. An environment label is not sufficient proof.
  assert.equal(typeof adapter.attestServiceIsolation,"function","independent service isolation attestation required");
  const isolation=await adapter.attestServiceIsolation({sourceSha,service:"bw-general-ai-staging",bindingEnvironment:inventory.serviceBindingEnvironment});
  collect(isolation,"service isolation");
  assert.equal(isolation.stagingOnly,true,"service binding may reach production");
  assert.equal(isolation.productionResourcesTouched,false);
  enableAttempted=true;
  collect(await adapter.enable({sourceSha}),"enable");
  const envelope=preparePrivateQueueTestEnvelope({sourceSha,approvedSourceSha,nonce,authorization,independentReview,environment:"general-ai-private-staging",queue:baseline.queue,consumerDisabled:false,productionEnabled:false});
  receipts.publish=collect(await adapter.publish(envelope),"publish");
  receipts.liveDeliveryVerified=collect(await adapter.verifyDelivery(),"delivery");
  receipts.liveAckVerified=collect(await adapter.verifyAck(),"ack");
  receipts.liveReplayVerified=collect(await adapter.verifyReplay(),"replay");
  receipts.recoveryVerified=collect(await adapter.verifyRecovery(),"recovery");
  receipts.d1IsolationVerified=collect(await adapter.verifyIsolation(),"isolation");
 } catch(error){originalError=error}
 finally {
  if(enableAttempted){
   try {
    collect(await adapter.disable(),"disable");
    const rollback=await adapter.verifyRollback();
    collect(rollback,"rollback");
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
 assert.deepEqual(Object.keys(receipts).filter(k=>k!=="publish").sort(),[...EVIDENCE_KEYS].sort(),"all six independent receipts required");
 const record={...state,runUrl,...Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,true])),evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,receipts[k]]))};
 validateLiveQueueAcceptance(record);
 return Object.freeze({accepted:true,sourceSha,runUrl,evidence:record.evidence});
}
