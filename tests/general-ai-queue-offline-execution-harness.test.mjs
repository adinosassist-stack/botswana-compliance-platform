import test from "node:test";
import assert from "node:assert/strict";
import {rehearsePrivateQueueAcceptance} from "../scripts/general-ai-queue-offline-execution-harness.mjs";
const sha="a".repeat(40);
const state={environment:"general-ai-private-staging",queue:"bw-general-ai-private-acceptance-queue",consumerDisabled:false,productionEnabled:false,publicRoutes:0,approvedSourceSha:sha};
function args(changes={}) {
 let rollbackCount=0;
 const adapter={
  inspect:async()=>({...state}),
  deliver:async()=>{},
  observe:async()=>({serviceInvocations:1,acknowledged:true}),
  rollback:async()=>{rollbackCount++;return {...state,consumerDisabled:true}}
 };
 return {sourceSha:sha,nonce:"b".repeat(32),authorization:"AUTHORIZE_PRIVATE_STAGING_QUEUE_TEST",independentReview:true,adapter,...changes};
}
test("offline rehearsal never asserts live qualification",async()=>{
 const result=await rehearsePrivateQueueAcceptance(args());
 assert.equal(result.scope,"OFFLINE_MOCK_ONLY");
 assert.equal(result.liveQualified,false);
 assert.equal(result.evidence.liveAckVerified,false);
 assert.deepEqual(result.calls,["deliver","observe","rollback"]);
});
test("invalid authorization refuses delivery",async()=>{
 let delivered=false;
 const a=args();a.authorization="";a.adapter.deliver=async()=>{delivered=true};
 await assert.rejects(rehearsePrivateQueueAcceptance(a));
 assert.equal(delivered,false);
});
test("failed mock ack still invokes rollback",async()=>{
 let rolledBack=false;
 const a=args();a.adapter.observe=async()=>({serviceInvocations:1,acknowledged:false});
 a.adapter.rollback=async()=>{rolledBack=true;return {...state,consumerDisabled:true}};
 await assert.rejects(rehearsePrivateQueueAcceptance(a),/ack/);
 assert.equal(rolledBack,true);
});
test("failed mock delivery still invokes rollback",async()=>{
 let rolledBack=false;
 const a=args();a.adapter.deliver=async()=>{throw Error("mock delivery failed")};
 a.adapter.rollback=async()=>{rolledBack=true;return {...state,consumerDisabled:true}};
 await assert.rejects(rehearsePrivateQueueAcceptance(a),/mock delivery failed/);
 assert.equal(rolledBack,true);
});
test("unsafe rollback fails closed",async()=>{
 const a=args();a.adapter.rollback=async()=>({...state,consumerDisabled:false});
 await assert.rejects(rehearsePrivateQueueAcceptance(a),/restored disabled/);
});
