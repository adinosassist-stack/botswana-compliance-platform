import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('public/js/workspace-readiness-v305.js','utf8');
const firstBoundary=source.indexOf('\n\n(()=>{',1);
assert.ok(firstBoundary>0,'workspace readiness bootstrap must have a separable first IIFE');
const readinessSource=source.slice(0,firstBoundary);

assert.match(readinessSource,/thebe:workspace-view-change/,'readiness bootstrap must guard cold-start view changes');
assert.match(readinessSource,/__THEBE_WORKSPACE_READY__!==true/,'view-change guard must apply only before authored readiness');
assert.match(readinessSource,/requestAnimationFrame/,'deferred view change must yield through a paint boundary');

const listeners=new Map();
const nativeDispatches=[];
const rafQueue=[];
const timerQueue=[];
const microtasks=[];
const addListener=(type,callback,options={})=>{
  const entries=listeners.get(type)||[];
  entries.push({callback,once:options?.once===true});
  listeners.set(type,entries);
};
const nativeDispatch=event=>{
  nativeDispatches.push(event);
  const entries=[...(listeners.get(event.type)||[])];
  for(const entry of entries){
    entry.callback.call(window,event);
    if(entry.once){
      const current=listeners.get(event.type)||[];
      listeners.set(event.type,current.filter(item=>item!==entry));
    }
  }
  return true;
};
const window={
  __THEBE_WORKSPACE_READY__:false,
  addEventListener:addListener,
  dispatchEvent:nativeDispatch,
};
window.window=window;
const document={
  getElementById(){return null;},
  body:null,
  documentElement:null,
};
const context=vm.createContext({
  window,
  document,
  console,
  queueMicrotask:callback=>microtasks.push(callback),
  requestAnimationFrame:callback=>{rafQueue.push(callback);return rafQueue.length;},
  setTimeout:callback=>{timerQueue.push(callback);return timerQueue.length;},
});
vm.runInContext(readinessSource,context,{filename:'workspace-readiness-v305.js'});

const first={type:'thebe:workspace-view-change',detail:{id:'dashboard'}};
const latest={type:'thebe:workspace-view-change',detail:{id:'workhub'}};
window.dispatchEvent(first);
window.dispatchEvent(latest);
assert.equal(nativeDispatches.filter(event=>event.type==='thebe:workspace-view-change').length,0,'cold-start view changes must not synchronously reach secondary listeners');

window.__THEBE_WORKSPACE_READY__=true;
window.dispatchEvent({type:'thebe:workspace-ready'});
assert.equal(nativeDispatches.filter(event=>event.type==='thebe:workspace-ready').length,1,'real authored-ready event must remain synchronous and intact');
assert.equal(nativeDispatches.filter(event=>event.type==='thebe:workspace-view-change').length,0,'deferred view change must not run inside authored-ready dispatch');
assert.equal(rafQueue.length,1,'deferred view change must wait for a paint boundary');

rafQueue.shift()();
assert.equal(timerQueue.length,1,'paint boundary must schedule a follow-up task');
timerQueue.shift()();
const delivered=nativeDispatches.filter(event=>event.type==='thebe:workspace-view-change');
assert.equal(delivered.length,1,'pre-ready navigation must coalesce to one post-ready notification');
assert.equal(delivered[0],latest,'the latest cold-start landing view must win');

const normal={type:'thebe:workspace-view-change',detail:{id:'peopleops'}};
window.dispatchEvent(normal);
assert.equal(nativeDispatches.at(-1),normal,'normal post-ready navigation must remain synchronous');

console.log('WORKSPACE_AUTHORED_READINESS_V306_PASS');
