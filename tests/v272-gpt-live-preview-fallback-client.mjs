import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('public/js/thebe-live-preview-fallback-v272.js','utf8');
function runtime(apiJson){
  const events=[];
  const context=vm.createContext({
    window:null,
    apiJson,
    location:{origin:'https://thebedesk.com'},
    document:{readyState:'complete',addEventListener(){}},
    CustomEvent:class CustomEvent{constructor(type,{detail}={}){this.type=type;this.detail=detail}},
    dispatchEvent:event=>{events.push(event);return true},
    Date,
    URL,
    setInterval:()=>0,
    clearInterval:()=>{}
  });
  context.window=context;
  vm.runInContext(source,context);
  assert.equal(context.ThebeLivePreviewFallback.install(),true);
  return {context,events};
}

const offer=JSON.stringify({sdp:'v=0\r\n'});
const calls=[];
const first=runtime(async(url,options={})=>{
  calls.push([url,options]);
  if(url==='/api/agentic/live/preview/status')return {sessionCreationAllowed:true,gateCode:'gpt_live_preview_ready'};
  if(url==='/api/agentic/live/preview/session')return {ok:true,runtime:'gpt-live',session:{id:'live-1'},transport:{sdp:'v=0\r\n'}};
  if(url==='/api/agentic/live/session')return {ok:true,runtime:'realtime'};
  throw new Error('unexpected');
});
const preview=await first.context.apiJson('/api/agentic/live/session',{method:'POST',body:offer});
assert.equal(preview.runtime,'gpt-live');
assert.deepEqual(calls.map(row=>row[0]),['/api/agentic/live/preview/status','/api/agentic/live/preview/session']);
assert.equal(first.events.some(event=>event.detail?.actualRuntime==='gpt-live'&&event.detail?.fallback===false),true);

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
assert.equal(second.events.some(event=>event.detail?.actualRuntime==='realtime'&&event.detail?.fallback===true),true);

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
assert.match(releaseSource,/thebe-live-preview-fallback-v272\.js/,'fallback selector is release-bound on HTML surfaces');
console.log('PASS: V272 preview selection performs immediate Realtime fallback only for retryable preview/provider failures and leaves all other API traffic untouched');
