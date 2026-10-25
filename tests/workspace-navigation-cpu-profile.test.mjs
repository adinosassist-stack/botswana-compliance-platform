import assert from 'node:assert/strict';
import {test} from 'node:test';
import {summarizeNavigationCpuProfile,profileNavigationClick} from '../scripts/workspace-navigation-cpu-profile.mjs';

test('CPU summary aggregates time and strips private URLs, queries, and source',()=>{
 const result=summarizeNavigationCpuProfile({nodes:[{id:1,callFrame:{functionName:'renderAll',url:'https://thebedesk.com/js/workspace.js?secret=private'}},{id:2,callFrame:{functionName:'private customer',url:'https://other.test/private'}},{id:3,callFrame:{functionName:'(idle)',url:''}}],samples:[1,1,2,3],timeDeltas:[1000,3000,7000,2000]});
 assert.deepEqual(result,{sampledMs:13,topFrames:[{script:'workspace.js',function:'renderAll',sampledMs:4,samples:2},{script:'engine',function:'(idle)',sampledMs:2,samples:1}]});
 assert.doesNotMatch(JSON.stringify(result),/private|secret|https/);
});
function fixture(fail=false){
 const commands=[],reports=[];let detached=false;
 const session={send:async name=>{commands.push(name);if(fail)throw new Error('unavailable');return {profile:{nodes:[],samples:[],timeDeltas:[]}};},detach:async()=>{detached=true;}};
 return {page:{context:()=>({newCDPSession:async()=>session})},reports,commands,detached:()=>detached};
}
test('failed real click remains failed and produces CPU evidence before cleanup',async()=>{
 const f=fixture(),error=new Error('click timeout');
 await assert.rejects(profileNavigationClick(f.page,'protecthub',async()=>{throw error;},line=>f.reports.push(line)),e=>e===error);
 assert(f.commands.includes('Profiler.stop'));assert(f.detached());
 const record=JSON.parse(f.reports.find(line=>line.startsWith('WORKSPACE_NAV_CPU ')).slice('WORKSPACE_NAV_CPU '.length));
 assert.equal(record.view,'protecthub');assert.equal(record.completed,false);
});
test('unavailable profiling preserves successful navigation and detaches',async()=>{
 const f=fixture(true);let clicked=0;
 assert.equal(await profileNavigationClick(f.page,'moneyhub',async()=>{clicked++;return 42;},line=>f.reports.push(line)),42);
 assert.equal(clicked,1);assert(f.detached());assert(f.reports.some(line=>line.startsWith('WORKSPACE_NAV_CPU_UNAVAILABLE ')));
});
