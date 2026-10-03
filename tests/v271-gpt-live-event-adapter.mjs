import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/js/thebe-gpt-live-adapter-v271.js','utf8');
let nowValue=1000;
const context=vm.createContext({
  globalThis:null,
  crypto:{randomUUID:()=>`event-${++nowValue}`},
  Date:{now:()=>nowValue},
  setTimeout,
  clearTimeout,
  console
});
context.globalThis=context;
vm.runInContext(source,context);
const live=context.ThebeGptLiveAdapter;
assert(live,'GPT-Live adapter global is available');
assert.equal(live.RELEASE,'20261003-gpt-live-event-adapter-v271');

assert.deepEqual(
  JSON.parse(JSON.stringify(live.transcriptDelta({type:'session.input_transcript.delta',delta:'hello ',start_ms:10,end_ms:30}))),
  {speaker:'user',delta:'hello ',startMs:10,endMs:30}
);
assert.equal(live.transcriptDelta({type:'conversation.item.input_audio_transcription.delta',delta:'legacy'}),null,'legacy Realtime transcript is not misclassified as GPT-Live');
assert.equal(live.clientDelegation({type:'session.delegation.created',delegation:{id:'d1',target:'responses'}}),null,'only client delegation is accepted');

const sent=[];
const transcripts=[];
let backendContext=null;
const adapter=live.createAdapter({
  send:event=>sent.push(event),
  runBackend:async ctx=>{backendContext=ctx;nowValue+=180;return {verified:true,content:'Verified business result.',authority:{executionPerformed:false}}},
  readTaskState:()=>({screen:'property'}),
  onTranscript:delta=>transcripts.push(delta),
  now:()=>nowValue
});
await adapter.handle({type:'session.input_transcript.delta',delta:'Check ',start_ms:100,end_ms:140});
await adapter.handle({type:'session.input_transcript.delta',delta:'rent',start_ms:140,end_ms:180});
await adapter.handle({type:'session.output_transcript.delta',delta:'I will check.',start_ms:181,end_ms:230});
const completed=await adapter.handle({type:'session.delegation.created',offset_ms:240,delegation:{id:'delegation-1',type:'delegation',target:'client'}});
assert.equal(completed.kind,'delegation_result');
assert.equal(backendContext.delegationId,'delegation-1');
assert.match(backendContext.recentConversation,/user: Check user: rentassistant: I will check\./);
assert.equal(backendContext.taskState.screen,'property');
assert.equal(sent[0].type,'session.thinking.append');
assert.equal(sent[0].delegation_id,'delegation-1');
assert.equal(sent[1].type,'session.commentary.append');
assert.equal(sent[1].content,'Verified business result.');
assert.equal(adapter.activeCount(),0);

let resolveBackend;
const staleSent=[];
const staleAdapter=live.createAdapter({
  send:event=>staleSent.push(event),
  runBackend:()=>new Promise(resolve=>{resolveBackend=resolve}),
  now:()=>nowValue
});
await staleAdapter.handle({type:'session.input_transcript.delta',delta:'Friday',start_ms:300,end_ms:350});
const pending=staleAdapter.handle({type:'session.delegation.created',offset_ms:360,delegation:{id:'delegation-stale',target:'client'}});
await Promise.resolve();
await staleAdapter.handle({type:'session.input_transcript.delta',delta:'Thursday instead',start_ms:400,end_ms:450});
resolveBackend({verified:true,content:'Friday is available.'});
const stale=await pending;
assert.equal(stale.kind,'delegation_stale');
assert.equal(staleSent.some(event=>event.type==='session.commentary.append'&&event.content.includes('Friday')),false,'stale result is never announced');
assert.equal(staleSent.at(-1).type,'session.thinking.append');

const failureSent=[];
const failureAdapter=live.createAdapter({
  send:event=>failureSent.push(event),
  runBackend:async()=>({verified:false,content:'Unverified result'})
});
const failed=await failureAdapter.handle({type:'session.delegation.created',offset_ms:0,delegation:{id:'delegation-fail',target:'client'}});
assert.equal(failed.kind,'delegation_error');
assert.match(failureSent.at(-1).content,/could not verify/i);
assert.throws(()=>live.appendEvent({kind:'commentary',delegationId:'d',content:''}),/gpt_live_append_content_required/);
assert.throws(()=>live.verifiedSummary({verified:false,content:'x'}),/gpt_live_backend_result_unverified/);

console.log('PASS: V271 handles GPT-Live transcript deltas, client delegation, verified commentary, stale suppression and fail-closed backend results');
