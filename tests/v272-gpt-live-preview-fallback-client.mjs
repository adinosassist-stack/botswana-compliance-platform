import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/js/thebe-live-preview-fallback-v272.js','utf8');

class FakeChannel{
  constructor(label){this.label=label;this.readyState='open';this.listeners=new Map();this.sent=[]}
  addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list)}
  dispatchEvent(event){for(const listener of [...(this.listeners.get(event.type)||[])])listener.call(this,event);return true}
  send(value){this.sent.push(JSON.parse(value))}
}
class FakePeerConnection{createDataChannel(label){return new FakeChannel(label)}}
class FakeMessageEvent{constructor(type,{data}={}){this.type=type;this.data=data}}
class FakeCustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail}}

function runtime(apiJson){
  const events=[];
  const context=vm.createContext({
    window:null,
    apiJson,
    RTCPeerConnection:FakePeerConnection,
    MessageEvent:FakeMessageEvent,
    CustomEvent:FakeCustomEvent,
    location:{origin:'https://thebedesk.com'},
    document:{readyState:'complete',addEventListener(){}},
    dispatchEvent:event=>{events.push(event);return true},
    Date,Math,URL,
    crypto:{randomUUID:()=>`event-${Math.random().toString(16).slice(2)}`},
    setInterval:()=>0,
    clearInterval:()=>{}
  });
  context.window=context;
  vm.runInContext(source,context);
  assert.equal(context.ThebeLivePreviewFallback.install(),true);
  assert.equal(context.ThebeLivePreviewFallback.state().bridgeInstalled,true);
  return {context,events};
}

const offer=JSON.stringify({sdp:'v=0\r\n'});
const calls=[];
const first=runtime(async(url,options={})=>{
  calls.push([url,options]);
  if(url==='/api/agentic/live/preview/status')return {sessionCreationAllowed:true,gateCode:'gpt_live_preview_ready'};
  if(url==='/api/agentic/live/preview/session')return {ok:true,runtime:'gpt-live',session:{id:'live-1'},transport:{sdp:'v=0\r\n'}};
  if(url==='/api/agentic/live/preview/delegation')return {verified:true,mode:'analyze',content:'Verified governed result.',verification:{source:'governed_live_backend'},authority:{executionPerformed:false}};
  if(url==='/api/agentic/live/session')return {ok:true,runtime:'realtime'};
  throw new Error('unexpected '+url);
});
const preview=await first.context.apiJson('/api/agentic/live/session',{method:'POST',body:offer});
assert.equal(preview.runtime,'gpt-live');
assert.deepEqual(calls.map(row=>row[0]),['/api/agentic/live/preview/status','/api/agentic/live/preview/session']);
assert.equal(first.events.some(event=>event.detail?.actualRuntime==='gpt-live'&&event.detail?.fallback===false),true);
assert.equal(first.context.ThebeLivePreviewFallback.state().activeRuntime,'gpt-live');

const pc=new first.context.RTCPeerConnection();
const channel=pc.createDataChannel('oai-events');
const observed=[];
channel.addEventListener('message',event=>{try{observed.push(JSON.parse(event.data))}catch{}});
channel.dispatchEvent(new FakeMessageEvent('message',{data:JSON.stringify({type:'session.started',session:{id:'live-1'}})}));
channel.dispatchEvent(new FakeMessageEvent('message',{data:JSON.stringify({type:'session.input_transcript.delta',delta:'Check revenue',start_ms:100,end_ms:220})}));
channel.dispatchEvent(new FakeMessageEvent('message',{data:JSON.stringify({type:'session.output_transcript.delta',delta:'I will check.',start_ms:230,end_ms:340})}));
assert(observed.some(event=>event.type==='session.created'),'GPT-Live session start is translated for the existing dock runtime');
assert(observed.some(event=>event.type==='conversation.item.input_audio_transcription.delta'&&event.delta==='Check revenue'));
assert(observed.some(event=>event.type==='response.output_audio_transcript.delta'&&event.delta==='I will check.'));
assert.equal(first.context.ThebeLivePreviewFallback.delegationTaskText(220),'Check revenue');

assert.equal(first.context.ThebeLivePreviewFallback.governedResultVerified({
  verified:true,mode:'analyze',content:'ok',verification:{source:'governed_live_backend'},authority:{executionPerformed:false}
}),true);
assert.equal(first.context.ThebeLivePreviewFallback.governedResultVerified({
  verified:true,mode:'prepare_internal_task',content:'prepared',verification:{source:'governed_live_backend'},authority:{executionPerformed:false,taskPrepared:true}
}),false);

channel.dispatchEvent(new FakeMessageEvent('message',{data:JSON.stringify({type:'session.delegation.created',offset_ms:220,delegation:{id:'del-1',target:'client'}})}));
await new Promise(resolve=>setTimeout(resolve,0));
assert(calls.some(row=>row[0]==='/api/agentic/live/preview/delegation'),'client delegation is routed through the verified preview bridge');
assert(channel.sent.some(event=>event.type==='session.thinking.append'&&event.delegation_id==='del-1'));
assert(channel.sent.some(event=>event.type==='session.commentary.append'&&event.content==='Verified governed result.'));

const fallbackCalls=[];
const second=runtime(async(url,options={})=>{
  fallbackCalls.push([url,options]);
  if(url==='/api/agentic/live/preview/status')return {sessionCreationAllowed:true};
  if(url==='/api/agentic/live/preview/session'){
    const error=new Error('preview unavailable');error.status=502;error.code='gpt_live_preview_upstream_failed';throw error;
  }
  if(url==='/api/agentic/live/session')return {ok:true,runtime:'realtime',session:{id:'rt-1'},transport:{sdp:'v=0\r\n'}};
  throw new Error('unexpected');
});
const fallback=await second.context.apiJson('/api/agentic/live/session',{method:'POST',body:offer});
assert.equal(fallback.runtime,'realtime');
assert.deepEqual(fallbackCalls.map(row=>row[0]),['/api/agentic/live/preview/status','/api/agentic/live/preview/session','/api/agentic/live/session']);
assert.equal(fallbackCalls[1][1].body,offer,'preview and Realtime receive the same WebRTC offer');
assert.equal(fallbackCalls[2][1].body,offer,'fallback preserves the exact original session body');
assert.equal(second.events.some(event=>event.type==='thebe-live-provider-fallback'&&event.detail?.stage==='attempt'),true);
assert.equal(second.events.some(event=>event.type==='thebe-live-provider-fallback'&&event.detail?.stage==='recovered'),true);
assert.equal(second.events.some(event=>event.detail?.actualRuntime==='realtime'&&event.detail?.fallback===true),true);

const failedFallbackCalls=[];
const failedFallback=runtime(async(url)=>{
  failedFallbackCalls.push(url);
  if(url==='/api/agentic/live/preview/status')return {sessionCreationAllowed:true};
  if(url==='/api/agentic/live/preview/session'){
    const error=new Error('preview unavailable');error.status=502;error.code='gpt_live_preview_upstream_failed';throw error;
  }
  if(url==='/api/agentic/live/session'){
    const error=new Error('realtime unavailable');error.status=503;error.code='realtime_upstream_failed';throw error;
  }
  throw new Error('unexpected');
});
await assert.rejects(()=>failedFallback.context.apiJson('/api/agentic/live/session',{method:'POST',body:offer}),/realtime unavailable/);
assert.deepEqual(failedFallbackCalls,['/api/agentic/live/preview/status','/api/agentic/live/preview/session','/api/agentic/live/session']);
assert.equal(failedFallback.events.some(event=>event.type==='thebe-live-provider-fallback'&&event.detail?.stage==='attempt'),true);
assert.equal(failedFallback.events.some(event=>event.type==='thebe-live-provider-fallback'&&event.detail?.stage==='failed'&&event.detail?.status===503),true);
assert.equal(failedFallback.events.some(event=>event.detail?.fallback===true),false,'failed Realtime fallback must not masquerade as a recovered runtime selection');

const disabledCalls=[];
const third=runtime(async(url,options={})=>{
  disabledCalls.push([url,options]);
  if(url==='/api/agentic/live/preview/status')return {sessionCreationAllowed:false,gateCode:'gpt_live_preview_disabled'};
  if(url==='/api/agentic/live/session')return {ok:true,runtime:'realtime'};
  throw new Error('unexpected');
});
const disabled=await third.context.apiJson('/api/agentic/live/session',{method:'POST',body:offer});
assert.equal(disabled.runtime,'realtime');
assert.deepEqual(disabledCalls.map(row=>row[0]),['/api/agentic/live/preview/status','/api/agentic/live/session']);

for(const status of [400,401,403,413,415]){
  const guardedCalls=[];
  const guarded=runtime(async(url)=>{
    guardedCalls.push(url);
    if(url==='/api/agentic/live/preview/status')return {sessionCreationAllowed:true};
    if(url==='/api/agentic/live/preview/session'){
      const error=new Error('request rejected');error.status=status;error.code=status===400?'invalid_webrtc_offer':'request_rejected';throw error;
    }
    if(url==='/api/agentic/live/session')return {ok:true,runtime:'realtime'};
    throw new Error('unexpected');
  });
  await assert.rejects(()=>guarded.context.apiJson('/api/agentic/live/session',{method:'POST',body:offer}));
  assert.equal(guardedCalls.includes('/api/agentic/live/session'),false,`status ${status} must not bypass request/auth validation via fallback`);
}

const passthroughCalls=[];
const passthrough=runtime(async(url,options)=>{passthroughCalls.push([url,options]);return {ok:true}});
await passthrough.context.apiJson('/api/state',{method:'GET'});
await passthrough.context.apiJson('/api/agentic/live/marketing/session',{method:'POST',body:offer});
assert.deepEqual(passthroughCalls.map(row=>row[0]),['/api/state','/api/agentic/live/marketing/session']);
assert.equal(passthroughCalls.some(row=>row[0].includes('/preview/')),false,'non-workspace-session traffic is untouched');

const releaseSource=fs.readFileSync('cloudflare/src/asset-release-identity.js','utf8');
assert.match(releaseSource,/thebe-live-preview-fallback-v272\.js/,'preview bridge is release-bound on HTML surfaces');
console.log('PASS: V272 browser bridge selects GPT-Live only when qualified, translates events, uses verified client delegation, falls back immediately to Realtime on retryable preview failure and leaves unrelated APIs untouched');
