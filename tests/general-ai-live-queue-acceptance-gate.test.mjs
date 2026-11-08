import test from "node:test";
import assert from "node:assert/strict";
import {initialLiveQueueAcceptance,validateLiveQueueAcceptance,REQUIRED_LIVE_EVIDENCE} from "../scripts/general-ai-live-queue-acceptance-gate.mjs";
const sourceSha="a".repeat(40);
const valid=()=>({
 ...initialLiveQueueAcceptance(sourceSha),
 runUrl:"https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/123456",
 evidence:Object.fromEntries(REQUIRED_LIVE_EVIDENCE.map(key=>[key,"artifact/live-"+key])),
 ...Object.fromEntries(REQUIRED_LIVE_EVIDENCE.map(key=>[key,true]))
});
test("all live evidence defaults to false",()=>{
 const initial=initialLiveQueueAcceptance(sourceSha);
 for(const key of REQUIRED_LIVE_EVIDENCE)assert.equal(initial[key],false);
 assert.ok(Object.isFrozen(initial));
 assert.throws(()=>validateLiveQueueAcceptance(initial));
});
test("complete independent live evidence schema can be validated",()=>{
 const accepted=validateLiveQueueAcceptance(valid());
 assert.equal(accepted.accepted,true);
});
test("every missing live proof blocks acceptance",()=>{
 for(const key of REQUIRED_LIVE_EVIDENCE){
  const record=valid();record[key]=false;
  assert.throws(()=>validateLiveQueueAcceptance(record),new RegExp(key));
  const noRef=valid();delete noRef.evidence[key];
  assert.throws(()=>validateLiveQueueAcceptance(noRef),new RegExp(key));
 }
});
test("production touch, customer activation, wrong environment, and fake run URL fail",()=>{
 for(const change of [
  {productionResourcesTouched:true},{customerAiEnabled:true},
  {environment:"production"},{queue:"production-queue"},
  {runUrl:"https://example.com/fake"},{sourceSha:"wrong"}
 ])assert.throws(()=>validateLiveQueueAcceptance({...valid(),...change}));
});
