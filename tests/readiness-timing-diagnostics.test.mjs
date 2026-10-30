import test from 'node:test';
import assert from 'node:assert/strict';
import {measureReadinessSteps} from '../scripts/readiness-timing-diagnostics.mjs';
test('successful checks expose only bounded names and timings',async()=>{
 let t=0;const result=await measureReadinessSteps([{name:'d1_ping',run:async()=>{t+=4;return true;}},{name:'schema',run:async()=>{t+=7;return true;}}],{clock:()=>t});
 assert.equal(result.ok,true);assert.deepEqual(result.steps,[{name:'d1_ping',elapsedMs:4,ok:true},{name:'schema',elapsedMs:7,ok:true}]);
});
test('database exception fails closed without leaking error text',async()=>{
 const result=await measureReadinessSteps([{name:'d1_ping',run:async()=>{throw Error('secret DB connection details');}}]);
 assert.equal(result.ok,false);assert.equal(result.reason,'check_failed');assert.doesNotMatch(JSON.stringify(result),/secret|connection details/);
});
test('failed schema check does not execute later steps',async()=>{
 let ran=false;const result=await measureReadinessSteps([{name:'schema',run:()=>false},{name:'config',run:()=>{ran=true;return true;}}]);
 assert.equal(result.ok,false);assert.equal(ran,false);
});
test('expired step budget fails closed before the next step',async()=>{
 let t=0,ran=false;const result=await measureReadinessSteps([{name:'d1_ping',run:()=>{t=20;return true;}},{name:'schema',run:()=>{ran=true;return true;}}],{clock:()=>t,budgetMs:10});
 assert.equal(result.reason,'budget_exceeded');assert.equal(ran,false);
});
test('invalid names and missing checks are refused',async()=>{
 await assert.rejects(measureReadinessSteps([]),/readiness_steps_required/);
 await assert.rejects(measureReadinessSteps([{name:'credential=secret',run:()=>true}]),/readiness_invalid_step/);
});
