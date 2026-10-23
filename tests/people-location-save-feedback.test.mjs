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

test('People location decorator preserves canonical validation and avoids forced form reopening',()=>{
 const decorator=readFileSync(new URL('../public/js/locations-branches-v335.js',import.meta.url),'utf8');
 assert.match(decorator,/if\(status&&!status\.textContent\.trim\(\)\)/,'existing backend error messages must be preserved');
 assert.match(decorator,/status\.dataset\.state="error"/,'fallback failure must expose an error state');
 const addAction=decorator.slice(decorator.indexOf('function bindAddLocationAction('),decorator.indexOf('function decorateLocationForm('));
 assert.doesNotMatch(addAction,/setTimeout\(revealLocations/,'save must not force scroll or refocus');
 assert.match(addAction,/button\.disabled=wasDisabled/,'button must recover after errors');
});
