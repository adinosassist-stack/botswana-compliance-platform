import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

for(const [id,file,shard] of [['accounthub','account-lazy-hydration-v532.js',4],['protecthub','protect-lazy-hydration-v528.js',10]]){
 function fixture(active=false){
  let resolveRequest;
  const events=new Map(),timers=[];
  const counts={requests:0,renders:0};
  const root={dataset:{lazyView:'1'},classList:{contains:()=>active},hasAttribute:name=>name==='data-lazy-view'&&root.dataset.lazyView==='1',removeAttribute:name=>{if(name==='data-lazy-view')delete root.dataset.lazyView;},setAttribute(){},dispatchEvent(){}};
  const context={document:{readyState:'complete',getElementById:()=>root,querySelector:()=>null},window:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>events.set(name,fn)},BW:{api:{createClient:()=>({request:()=>{counts.requests++;return new Promise(resolve=>resolveRequest=resolve);}})},dom:{renderMarkup:()=>counts.renders++}},MutationObserver:class {constructor(fn){events.set('active-class-change',fn);}observe(){}},queueMicrotask:fn=>fn(),setTimeout:fn=>timers.push(fn),console:{warn(){}},CustomEvent:class {},URL};
  vm.runInNewContext(readFileSync(new URL('../public/js/'+file,import.meta.url),'utf8'),context);
  return {root,counts,setActive:value=>active=value,activate:()=>{active=true;events.get('active-class-change')?.();},open:()=>events.get('thebe:workspace-view-change')?.({detail:{id}}),resolve:async()=>{resolveRequest({schema:2,shard,views:{[id]:'<h2>Ready</h2>'}});for(let i=0;i<8;i++)await Promise.resolve();},timers};
 }
 test(file+': hidden route does not fetch or render during boot',()=>{
  const f=fixture();assert.equal(f.counts.requests,0);assert.equal(f.counts.renders,0);
 });
 test(file+': opening the route starts recovery',async()=>{
  const f=fixture();f.setActive(true);f.open();assert.equal(f.counts.requests,1);await f.resolve();assert.equal(f.counts.renders,1);assert.equal(f.root.dataset.lazyHydrated,'1');
 });
 test(file+': lazy placeholder activation starts recovery without a view-change event',async()=>{
  const f=fixture();f.activate();assert.equal(f.counts.requests,1);f.open();assert.equal(f.counts.requests,1);await f.resolve();assert.equal(f.counts.renders,1);
 });
 test(file+': leaving a pending route skips stale rendering and permits retry',async()=>{
  const f=fixture(true);assert.equal(f.counts.requests,1);f.setActive(false);await f.resolve();assert.equal(f.counts.renders,0);assert.equal(f.root.dataset.lazyView,'1');f.setActive(true);f.open();assert.equal(f.counts.requests,2);await f.resolve();assert.equal(f.counts.renders,1);
 });
 test(file+': normal navigation hydration wins over pending recovery',async()=>{
  const f=fixture(true);delete f.root.dataset.lazyView;f.root.dataset.lazyHydrated='1';await f.resolve();assert.equal(f.counts.renders,0);
 });
}
