import test from "node:test";
import assert from "node:assert/strict";
import {runProtectedPrivateQueueAcceptance as run} from "../scripts/general-ai-protected-queue-acceptance-orchestrator.mjs";
const sha="a".repeat(40),nonce="b".repeat(32),runUrl="https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42475715635";
const receipt=(name,extra={})=>({verified:true,scope:"general-ai-private-staging",reference:"receipt."+name+".staging",...extra});
const options=(adapter)=>({sourceSha:sha,approvedSourceSha:sha,authorization:"AUTHORIZE_PRIVATE_STAGING_QUEUE_TEST",independentReview:true,nonce,runUrl,adapter});
function mock(failAt){
 const calls=[];
 const fn=(name,extra={})=>async (...args)=>{calls.push(name);if(failAt===name)throw Error("injected_"+name);return receipt(name,extra)};
 const adapter={
 inspect:fn("inspect",{consumerDisabled:true,publicRoutes:0,productionEnabled:false,queue:"bw-general-ai-private-acceptance-queue",environment:"general-ai-private-staging",sourceSha:sha}),
 enable:fn("enable"),publish:fn("publish"),verifyDelivery:fn("verifyDelivery"),verifyAck:fn("verifyAck"),verifyReplay:fn("verifyReplay"),verifyRecovery:fn("verifyRecovery"),verifyIsolation:fn("verifyIsolation"),
 disable:fn("disable"),verifyRollback:fn("verifyRollback",{consumerDisabled:true,publicRoutes:0,productionEnabled:false})
 };
 return {adapter,calls};
}
test("complete staging-only evidence chain returns acceptance after rollback",async()=>{
 const m=mock();const result=await run(options(m.adapter));
 assert.equal(result.accepted,true);
 assert.deepEqual(m.calls,["inspect","enable","publish","verifyDelivery","verifyAck","verifyReplay","verifyRecovery","verifyIsolation","disable","verifyRollback"]);
 assert.equal(Object.keys(result.evidence).length,6);
});
test("no authorization, independent approval or exact SHA means no side effects",async()=>{
 for(const override of [{authorization:"DEPLOY_PRIVATE_GENERAL_AI_QUEUE"},{independentReview:false},{approvedSourceSha:"c".repeat(40)},{runUrl:"https://example.com"}]){
  const m=mock();await assert.rejects(run({...options(m.adapter),...override}));assert.deepEqual(m.calls,[]);
 }
});
test("every failure after enabling invokes rollback",async()=>{
 for(const name of ["enable","publish","verifyDelivery","verifyAck","verifyReplay","verifyRecovery","verifyIsolation"]){
  const m=mock(name);await assert.rejects(run(options(m.adapter)));assert.ok(m.calls.includes("disable"),name);assert.ok(m.calls.includes("verifyRollback"),name);
 }
});
test("rollback failure is surfaced as critical incident, not success",async()=>{
 for(const name of ["disable","verifyRollback"]){const m=mock(name);await assert.rejects(run(options(m.adapter)),/STAGING_ROLLBACK_NOT_VERIFIED/);}
});
test("unverified receipts cannot be counted as live acceptance",async()=>{
 const m=mock();m.adapter.verifyAck=async()=>{m.calls.push("verifyAck");return {verified:false,scope:"general-ai-private-staging",reference:"receipt.ack.staging"}};
 await assert.rejects(run(options(m.adapter)),/ack not verified/);assert.ok(m.calls.includes("verifyRollback"));
});
test("wrong baseline never enables consumer",async()=>{
 const m=mock();m.adapter.inspect=async()=>{m.calls.push("inspect");return receipt("inspect",{consumerDisabled:false,publicRoutes:0,productionEnabled:false,queue:"bw-general-ai-private-acceptance-queue",environment:"general-ai-private-staging",sourceSha:sha})};
 await assert.rejects(run(options(m.adapter)));assert.deepEqual(m.calls,["inspect"]);
});
test("missing adapter operation fails before any side effects",async()=>{
 const m=mock();delete m.adapter.verifyIsolation;await assert.rejects(run(options(m.adapter)),/verifyIsolation adapter required/);assert.deepEqual(m.calls,[]);
});

test("wrong scope and reused evidence receipts fail closed with rollback",async()=>{
 const m=mock();m.adapter.verifyDelivery=async()=>{m.calls.push("verifyDelivery");return receipt("delivery",{scope:"production"})};
 await assert.rejects(run(options(m.adapter)),/wrong scope/);assert.ok(m.calls.includes("verifyRollback"));
 const n=mock();n.adapter.verifyAck=async()=>{n.calls.push("verifyAck");return receipt("verifyDelivery")};
 await assert.rejects(run(options(n.adapter)),/reused evidence reference/);assert.ok(n.calls.includes("verifyRollback"));
});
