import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const runtime=readFileSync(new URL('../public/js/workspace-runtime-20261001b.js',import.meta.url),'utf8');
function fixture(error){
 const elements={opsLocationName:{value:'Maun'},opsLocationCode:{value:'MAU'},opsLocationTown:{value:'Maun'},opsLocationStatus:{textContent:'',dataset:{},setAttribute(){}}};
 let writes=0;const context={document:{getElementById:id=>elements[id]||null},notifyUser(){},apiJson:async()=>{writes++;if(error)throw error;return {ok:true};}};
 const start=runtime.indexOf('function setOpsLocationStatus('),end=runtime.indexOf('async function editOpsLocation(',start);
 assert(start>=0&&end>start,'persistent location feedback helper missing');
 const save=vm.runInNewContext(runtime.slice(start,end)+'\naddOpsLocation',context);
 return {save,elements,writes:()=>writes};
}
test('plan limit remains visible and preserves the draft',async()=>{
 const f=fixture({code:'location_plan_limit_reached',data:{limit:2}});await f.save();
 assert.match(f.elements.opsLocationStatus.textContent,/limit of 2/);assert.match(f.elements.opsLocationStatus.textContent,/Plan & billing/);
 assert.equal(f.elements.opsLocationName.value,'Maun');assert.equal(f.elements.opsLocationStatus.dataset.state,'error');
});
test('duplicate code and validation errors are actionable',async()=>{
 const f=fixture({code:'location_code_already_used'});await f.save();assert.match(f.elements.opsLocationStatus.textContent,/code.*already/i);
 f.elements.opsLocationName.value='A';await f.save();assert.match(f.elements.opsLocationStatus.textContent,/at least 2/);assert.equal(f.writes(),1);
});
test('save progress is immediate and successful save clears fields',async()=>{
 const f=fixture();const pending=f.save();assert.match(f.elements.opsLocationStatus.textContent,/Saving/);await pending;
 assert.equal(f.elements.opsLocationName.value,'');assert.equal(f.elements.opsLocationStatus.textContent,'Location added.');
});
test('canonical HTML and delivered runtime share the same save logic',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const extract=s=>s.slice(s.indexOf('function setOpsLocationStatus('),s.indexOf('async function editOpsLocation(',s.indexOf('function setOpsLocationStatus(')));
 assert.equal(extract(html),extract(runtime));
});
test('a list-refresh failure cannot turn a completed save into a failed save',async()=>{
 const f=fixture();f.elements.peopleops={classList:{contains:()=>true}};
 // A missing renderer simulates a refresh failure after the confirmed POST.
 await f.save();assert.match(f.elements.opsLocationStatus.textContent,/Location added.*Refresh/);
 assert.equal(f.elements.opsLocationName.value,'');assert.equal(f.writes(),1);
});

function decoratorFixture(action,initialStatus=''){
 let handler=null;
 const attrs=new Map();
 const status={textContent:initialStatus,dataset:{},setAttribute(k,v){attrs.set(k,v)}};
 const draft={name:'Maun Office',code:'MAU',town:'Maun'};
 const button={
   dataset:{},disabled:false,
   setAttribute(k,v){attrs.set('button:'+k,v)},
   removeAttribute(k){attrs.delete('button:'+k)},
   addEventListener(type,callback){assert.equal(type,'click');handler=callback}
 };
 const people={querySelector(selector){
   if(selector==='[data-bw-onclick="addOpsLocation()"]')return button;
   if(selector==='#opsLocationStatus')return status;
   return null;
 }};
 const source=readFileSync(new URL('../public/js/locations-branches-v335.js',import.meta.url),'utf8');
 const start=source.indexOf('function bindAddLocationAction('),end=source.indexOf('function decorateLocationForm(',start);
 assert(start>=0&&end>start,'People save decorator must exist');
 let timed=0;
 const bind=vm.runInNewContext(source.slice(start,end)+'\\nbindAddLocationAction',{
   window:{addOpsLocation:action},console:{error(){}},setTimeout(){timed++}
 });
 bind(people);
 const click=()=>handler({preventDefault(){},stopPropagation(){}});
 return {click,button,status,attrs,draft,timed:()=>timed};
}

test('decorated People save preserves draft and provides fallback after rejected promise',async()=>{
 const f=decoratorFixture(async()=>{throw Error('network unavailable')});
 await f.click();
 assert.match(f.status.textContent,/Could not add location/);
 assert.equal(f.status.dataset.state,'error');
 assert.equal(f.attrs.get('role'),'alert');
 assert.deepEqual(f.draft,{name:'Maun Office',code:'MAU',town:'Maun'});
 assert.equal(f.button.disabled,false);
 assert.equal(f.attrs.has('button:aria-busy'),false);
 assert.equal(f.button.dataset.locationsBranchesSaving,undefined);
 assert.equal(f.timed(),0,'rejected save must not refocus or scroll to form');
});

test('decorator never overwrites the canonical plan-limit explanation',async()=>{
 let f;
 f=decoratorFixture(async()=>{
   f.status.textContent='Your plan has reached its location limit. Visit Plan & billing.';
   f.status.dataset.state='error';
   throw Error('save was rejected');
 });
 await f.click();
 assert.match(f.status.textContent,/Plan & billing/);
 assert.doesNotMatch(f.status.textContent,/Could not add location/);
 assert.equal(f.button.disabled,false);
});

test('unexpected save failure replaces a stale saving message',async()=>{
 let f;
 f=decoratorFixture(async()=>{
   f.status.textContent='Saving location…';
   throw Error('request aborted');
 });
 await f.click();
 assert.equal(f.status.textContent,'Could not add location. Please retry.');
});

test('decorated save suppresses duplicate submission and leaves successful values alone',async()=>{
 let release;
 let calls=0;
 const f=decoratorFixture(async()=>{calls++;await new Promise(resolve=>release=resolve);f.status.textContent='Location added.'});
 const first=f.click();
 const second=f.click();
 assert.equal(calls,1,'repeated click must not send duplicate POST');
 assert.equal(f.button.disabled,true);
 assert.equal(f.attrs.get('button:aria-busy'),'true');
 await second;
 release();
 await first;
 assert.equal(f.status.textContent,'Location added.');
 assert.equal(f.button.disabled,false);
 assert.equal(f.timed(),0,'success must not automatically reopen or focus the form');
});
