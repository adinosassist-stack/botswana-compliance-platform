import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
const start=source.slice(source.indexOf('  async function start(options={}){'),source.indexOf('  function cleanup(',source.indexOf('  async function start(options={}){')));
function fixture(){
 let resolveGate,calls=0;
 const gate=new Promise(resolve=>{resolveGate=resolve});
 const context=vm.createContext({state:'idle',sessionId:null,sessionMode:'workspace',voiceStartGeneration:0,microphoneMuted:false,
  global:{isSecureContext:true,RTCPeerConnection:function(){}},navigator:{mediaDevices:{getUserMedia(){throw Error('microphone must stay closed')}}},
  api:()=>{calls++;return gate},text:(value)=>String(value||''),setState(value){context.state=value},
  cleanup(value){context.state=value}});
 vm.runInContext(start,context);
 return {context,resolveGate,get calls(){return calls}};
}
test('repeat voice start during preflight makes only one availability request',async()=>{
 const f=fixture();
 const first=f.context.start();
 const second=f.context.start();
 f.resolveGate({sessionCreationAllowed:false});
 await Promise.allSettled([first,second]);
 assert.equal(f.calls,1);
 assert.equal(f.context.state,'idle','a denied gate permits an intentional retry');
});
test('preflight denial resets connecting state without opening microphone',async()=>{
 const f=fixture();
 const first=f.context.start();
 assert.equal(f.context.state,'connecting');
 f.resolveGate({sessionCreationAllowed:false});
 await assert.rejects(first,/not enabled/);
 assert.equal(f.context.state,'idle');
});

test('cancelled preflight cannot reopen the microphone or replace a newer state',async()=>{
 const f=fixture();
 const first=f.context.start();
 f.context.voiceStartGeneration++;
 f.context.state='idle';
 f.resolveGate({sessionCreationAllowed:true});
 const result=await first;
 assert.equal(result.cancelled,true);
 assert.equal(f.context.state,'idle');
});
test('a denied gate allows the next deliberate start to retry',async()=>{
 const f=fixture();
 const first=f.context.start();
 f.resolveGate({sessionCreationAllowed:false});
 await assert.rejects(first,/not enabled/);
 await assert.rejects(f.context.start(),/not enabled/);
 assert.equal(f.calls,2);
 assert.equal(f.context.state,'idle');
});
