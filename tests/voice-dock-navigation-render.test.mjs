import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/js/thebe-live-voice.js',import.meta.url),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
function mission(){
 const events=[];
 const node=()=>{const state={};return new Proxy(state,{set(target,key,value){events.push('write');target[key]=value;return true;},get(target,key){if(key==='setAttribute')return (name,value)=>{events.push('write');target[name]=value;};if(key==='getAttribute')return name=>target[name]??null;return target[key];}});};
 const context={missionRail:{dataset:node()},missionLabel:node(),missionMeta:node(),missionAction:node(),ownerCommandState:{pendingReviews:1},persistentObjectiveState:{},surfaceMode:()=>{events.push('read');return 'workspace';},commandCentreRole:()=> 'owner',missionDescriptor:()=>({stage:4,tone:'review',label:'Waiting for you'})};
 const code=section('  function ownerCommandSummary(', '  function openOwnerCommandCentre(')+section('  function syncMission(){','  function syncMascotContext(');
 const sync=vm.runInNewContext(code+'\nsyncMission',context);
 return {events,sync,context};
}
test('mission refresh reads surface once before any writes',()=>{
 const f=mission();f.sync();assert.equal(f.events.filter(e=>e==='read').length,1);assert.equal(f.events[0],'read');
 assert.equal(f.context.missionAction.hidden,false);assert.equal(f.context.missionAction.textContent,'Review');
});
test('unchanged mission refresh does not mutate DOM again',()=>{
 const f=mission();f.sync();f.events.length=0;f.sync();assert.deepEqual(f.events,['read']);
});
test('navigation mutation burst refreshes dock only once per frame',()=>{
 const code=section('    let workspaceViewSyncPending=false;', '    if(pageTitle)new MutationObserver(');
 const frames=[];let calls=0;
 const context={global:{requestAnimationFrame:fn=>frames.push(fn)},syncAfterWorkspaceViewChange:()=>calls++};
 const schedule=vm.runInNewContext(code+'\nscheduleWorkspaceViewSync',context);
 for(let i=0;i<66;i++)schedule();assert.equal(frames.length,1);assert.equal(calls,0);
 frames.shift()();assert.equal(calls,1);schedule();assert.equal(frames.length,1);frames.shift()();assert.equal(calls,2);
});
test('mission updates changed state and preserves role and surface restrictions',()=>{
 const f=mission();f.sync();
 f.context.ownerCommandState={runtimeKillSwitch:true};f.sync();
 assert.equal(f.context.missionAction.textContent,'Inspect guard');
 f.context.commandCentreRole=()=> 'employee';f.sync();assert.equal(f.context.missionAction.hidden,true);
 f.context.commandCentreRole=()=> 'owner';f.context.surfaceMode=()=> 'public';f.sync();
 assert.equal(f.context.missionAction.hidden,true);assert.equal(f.context.missionMeta.textContent,'Public assistant');
});
test('title, view mutations and explicit navigation share the frame scheduler',()=>{
 assert.match(source,/if\(pageTitle\)new MutationObserver\(scheduleWorkspaceViewSync\)/);
 assert.match(source,/querySelectorAll\("\.view"\).*new MutationObserver\(scheduleWorkspaceViewSync\)/);
 assert.match(source,/addEventListener\("thebe:workspace-view-change",\(\)=>\{scheduleWorkspaceViewSync\(\)/);
});
