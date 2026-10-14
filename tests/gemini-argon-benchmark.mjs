import assert from "node:assert/strict";
import {summarizeBenchmark} from "../scripts/gemini-argon-benchmark.mjs";

const base={model:"gemini-4-argon",taskId:"reconciliation-001",verified:true,correct:true,authorized:true,costUsd:.002,latencyMs:300};
const good=summarizeBenchmark([base,{...base,taskId:"reconciliation-002",latencyMs:600}])[0];
assert.equal(good.runs,2);
assert.equal(good.verifiedSuccess,2);
assert.equal(good.costPerVerifiedSuccessUsd,.002);
assert.equal(good.p95LatencyMs,600);
assert.equal(good.eligibleForReview,true);
assert.equal(summarizeBenchmark([{...base,verified:false}])[0].verifiedSuccess,0);
assert.equal(summarizeBenchmark([{...base,authorized:false}])[0].eligibleForReview,false);
assert.equal(summarizeBenchmark([{...base,correct:false}])[0].costPerVerifiedSuccessUsd,null);
assert.throws(()=>summarizeBenchmark([{...base,prompt:"private"}]),/unsafe_field/);
assert.throws(()=>summarizeBenchmark([{...base,costUsd:-1}]),/invalid_metrics/);
assert.throws(()=>summarizeBenchmark([{...base,verified:undefined}]),/missing_review_evidence/);
console.log("Gemini Argon offline benchmark contract passed");
