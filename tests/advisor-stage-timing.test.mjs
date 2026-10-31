import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdvisorStageTimer} from '../cloudflare/src/advisor-stage-timing.js';

test('production and disabled staging never log timings',async()=>{
 for(const env of [{APP_ENV:'production',THEBE_ADVISOR_STAGE_TIMING:'1'},{APP_ENV:'staging'}]){
  const events=[];const time=createAdvisorStageTimer(env,{clock:()=>0,log:x=>events.push(x)});
  assert.equal(await time('context',async()=>42),42);assert.deepEqual(events,[]);
 }
});
test('opt-in staging logs only fixed stage, outcome and elapsedMs',async()=>{
 let now=10;const events=[];const time=createAdvisorStageTimer({APP_ENV:'staging',THEBE_ADVISOR_STAGE_TIMING:'1'},{clock:()=>now,log:x=>events.push(JSON.parse(x))});
 assert.equal(await time('provider',async()=>{now=35;return 'secret model text'}),'secret model text');
 assert.deepEqual(events,[{event:'thebe_ai_advisor_stage',stage:'provider',outcome:'ok',elapsedMs:25}]);
 assert.doesNotMatch(JSON.stringify(events),/secret|tenant|prompt|sql|credit/i);
});
test('exception preserved and only sanitized failure timing logged',async()=>{
 let now=0;const events=[];const time=createAdvisorStageTimer({APP_ENV:'staging',THEBE_ADVISOR_STAGE_TIMING:'1'},{clock:()=>now,log:x=>events.push(JSON.parse(x))});
 const secretError=new Error('private provider key');
 await assert.rejects(time('provider',async()=>{now=15;throw secretError}),e=>e===secretError);
 assert.deepEqual(events,[{event:'thebe_ai_advisor_stage',stage:'provider',outcome:'error',elapsedMs:15}]);
});
test('invalid arbitrary stage names refused',async()=>{
 const time=createAdvisorStageTimer({APP_ENV:'production'});
 await assert.rejects(time('tenant_secret',async()=>true),/invalid_advisor_stage/);
});
