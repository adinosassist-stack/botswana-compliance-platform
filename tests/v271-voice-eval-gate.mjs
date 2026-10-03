import assert from 'node:assert/strict';
import {summarizeVoiceRuntime,compareVoiceRuntimes} from '../cloudflare/src/agentic-live-voice-eval-v271.js';

function sample(runtime,index,overrides={}){
  const live=runtime==='gpt_live';
  return {
    runtime,
    firstUsefulMs:(live?760:920)+index*5,
    interruptionStopMs:(live?420:520)+index*4,
    taskSuccess:true,
    silenceRecovery:true,
    multilingualContinuity:true,
    gracefulProviderFailure:true,
    estimatedCostUsd:live?0.031:0.028,
    ...overrides
  };
}
const measured=[];
for(let i=0;i<8;i++)measured.push(sample('realtime',i),sample('gpt_live',i));
const baseline=summarizeVoiceRuntime(measured,'realtime');
assert.equal(baseline.samples,8);
assert.equal(baseline.taskSuccessRate,1);
assert(baseline.firstUsefulP50Ms>0);
const comparison=compareVoiceRuntimes(measured,{minimumSamples:8});
assert.equal(comparison.eligibleForReview,true);
assert.equal(comparison.productionSwitchAllowed,false,'eval success can only make candidate eligible for human review');
assert.equal(comparison.checks.costMeasured,true);

const sparse=compareVoiceRuntimes(measured.slice(0,6),{minimumSamples:8});
assert.equal(sparse.checks.enoughSamples,false);
assert.equal(sparse.eligibleForReview,false);

const degraded=[];
for(let i=0;i<8;i++){
  degraded.push(sample('realtime',i));
  degraded.push(sample('gpt_live',i,{taskSuccess:i<5,silenceRecovery:i<6,multilingualContinuity:i<6,gracefulProviderFailure:i<7,firstUsefulMs:1400+i*10,interruptionStopMs:1500+i*8}));
}
const failed=compareVoiceRuntimes(degraded,{minimumSamples:8});
assert.equal(failed.eligibleForReview,false);
assert.equal(failed.checks.taskSuccess,false);
assert.equal(failed.checks.firstUsefulLatency,false);
assert.equal(failed.checks.interruptionLatency,false);
assert.equal(failed.productionSwitchAllowed,false);

console.log('PASS: V271 measures latency, interruption, task success, silence recovery, multilingual continuity, provider failure and cost while keeping cutover manual');
