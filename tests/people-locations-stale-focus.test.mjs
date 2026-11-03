import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/js/locations-branches-v335.js',import.meta.url),'utf8');
function fixture(){
 const timers=[];
 let focus=0,scroll=0,active=true,connected=true;
 const input={get isConnected(){return connected},focus(){focus++}};
 const setup={open:false,querySelector(){return null}};
 const target={scrollIntoView(){scroll++}};
 const people={
  classList:{contains:()=>active},hidden:false,getAttribute:()=>null,
  querySelector(sel){return sel==='#opsReportingSetupDetails'?setup:sel==='#locationsBranchesHeading'?target:sel==='#opsLocationName'?input:null}
 };
 const context={document:{getElementById:id=>id==='peopleops'?people:null},
  scheduleOnboardingYield(){},decoratePeople(){},
  setTimeout(fn){timers.push(fn)}};
 const begin=source.indexOf('function peopleIsActive(');
 const end=source.indexOf('function yieldOnboardingForPeople(',begin);
 const reveal=source.indexOf('function revealLocations(');
 const finish=source.indexOf('function openLocationsBranches(',reveal);
 assert.ok(begin>=0&&end>begin&&reveal>=0&&finish>reveal);
 const api=vm.runInNewContext('let locationsOpenEpoch=1;'+source.slice(begin,end)+source.slice(reveal,finish)+';({revealLocations,leave:()=>{locationsOpenEpoch++}})',context);
 return {api,timers,setup,input,get focus(){return focus},get scroll(){return scroll},deactivate(){active=false},detach(){connected=false}};
}
test('focus occurs while People view and original request remain active',()=>{
 const f=fixture();assert.equal(f.api.revealLocations(),true);assert.equal(f.scroll,1);
 assert.equal(f.focus,0);f.timers[0]();assert.equal(f.focus,1);
});
test('leaving People before delayed focus cancels focus stealing',()=>{
 const f=fixture();f.api.revealLocations();f.deactivate();f.api.leave();f.timers[0]();assert.equal(f.focus,0);
});
test('a newer location-open request invalidates older focus callback',()=>{
 const f=fixture();f.api.revealLocations();f.api.leave();f.timers[0]();assert.equal(f.focus,0);
});
test('closed setup or detached input cannot receive stale focus',()=>{
 const closed=fixture();closed.api.revealLocations();closed.setup.open=false;closed.timers[0]();assert.equal(closed.focus,0);
 const detached=fixture();detached.api.revealLocations();detached.detach();detached.timers[0]();assert.equal(detached.focus,0);
});
test('existing add-location save contract remains present',()=>{
 assert.match(source,/locationsBranchesSaving/);
 assert.match(source,/await action\(\)/);
 assert.match(source,/status\.dataset\.state="error"/);
 assert.match(source,/focusEpoch!==locationsOpenEpoch/);
 assert.match(source,/!peopleIsActive\(\)/);
});
