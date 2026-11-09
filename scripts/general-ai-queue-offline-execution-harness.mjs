import assert from "node:assert/strict";
import {preparePrivateQueueTestEnvelope,prepareQueueRollbackCheck} from "./general-ai-live-queue-execution-guardrails.mjs";
import {initialLiveQueueAcceptance} from "./general-ai-live-queue-acceptance-gate.mjs";

/** Inert rehearsal: adapters are injected mocks. Never connects to Cloudflare. */
export async function rehearsePrivateQueueAcceptance({sourceSha,nonce,authorization,independentReview,adapter}) {
 assert.ok(adapter && typeof adapter === "object");
 const calls=[];
 const requireMethod=name=>{assert.equal(typeof adapter[name],"function",`missing isolated adapter: ${name}`);};
 for(const name of ["inspect","deliver","observe","rollback"])requireMethod(name);
 const initial=await adapter.inspect();
 assert.deepEqual(initial,{
  environment:"general-ai-private-staging",
  queue:"bw-general-ai-private-acceptance-queue",
  consumerDisabled:false,
  productionEnabled:false,
  publicRoutes:0,
  approvedSourceSha:sourceSha
 },"mock staging isolation state invalid");
 const envelope=preparePrivateQueueTestEnvelope({
  sourceSha,nonce,authorization,independentReview,
  environment:initial.environment,queue:initial.queue,
  consumerDisabled:initial.consumerDisabled,productionEnabled:initial.productionEnabled,
  approvedSourceSha:initial.approvedSourceSha
 });
 let observation;
 try {
  calls.push("deliver");
  await adapter.deliver(envelope);
  calls.push("observe");
  observation=await adapter.observe();
  assert.equal(observation?.serviceInvocations,1,"exactly one private service invocation expected");
  assert.equal(observation?.acknowledged,true,"mock ack must be observed");
 } finally {
  calls.push("rollback");
  const restored=await adapter.rollback();
  prepareQueueRollbackCheck({
   consumerDisabled:restored.consumerDisabled,publicRoutes:restored.publicRoutes,
   productionEnabled:restored.productionEnabled,sourceSha,approvedSourceSha:restored.approvedSourceSha
  });
 }
 return Object.freeze({
  scope:"OFFLINE_MOCK_ONLY",liveQualified:false,
  evidence:initialLiveQueueAcceptance(sourceSha),
  observedMockAck:observation.acknowledged,
  calls:Object.freeze(calls)
 });
}
