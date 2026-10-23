import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {summarizeWorkspaceNavigationPerformance} from '../scripts/workspace-navigation-performance-summary.mjs';

const synthetic=readFileSync(new URL('../scripts/production-synthetic-full-user-wrapper.mjs',import.meta.url),'utf8');

test('synthetic navigation profiler measures real DOM clicks, active transitions, two-frame settling and long tasks',()=>{
 assert.match(synthetic,/document\.addEventListener\('click',event=>/);
 assert.match(synthetic,/event\.target\.closest\('#nav button\[data-view\]'\)/);
 assert.match(synthetic,/new MutationObserver\(/);
 assert.match(synthetic,/attributeFilter:\['class'\]/);
 assert.match(synthetic,/observer\.observe\(\{type:'longtask',buffered:true\}\)/);
 assert.match(synthetic,/longTaskSupported:state\.longTaskSupported/);
 assert.match(synthetic,/task\.duration>=50/);
 assert.match(synthetic,/requestAnimationFrame\(\(\)=>setTimeout\(\(\)=>requestAnimationFrame\(resolve\),0\)\)/);
 assert.match(synthetic,/WORKSPACE_NAV_SAMPLE /);
 assert.match(synthetic,/WORKSPACE_NAV_PERF_SUMMARY /);
 assert.match(synthetic,/navigationPerfSamples\.length===views\.length/);
});

test('navigation summary uses nearest-rank p95 and keeps route slugs only',()=>{
 const samples=[
  {view:'dashboard',longTaskSupported:true,activateMs:10,settledFrameMs:30,longTaskCount:0,longTaskTotalMs:0,worstLongTaskMs:0},
  {view:'security',longTaskSupported:true,activateMs:25,settledFrameMs:140,longTaskCount:2,longTaskTotalMs:180,worstLongTaskMs:110},
  {view:'employees',longTaskSupported:true,activateMs:90,settledFrameMs:230,longTaskCount:1,longTaskTotalMs:80,worstLongTaskMs:80},
  {view:'unsafe path / PII',longTaskSupported:true,activateMs:500,settledFrameMs:8000,longTaskCount:9,longTaskTotalMs:800,worstLongTaskMs:300}
 ];
 assert.deepEqual(summarizeWorkspaceNavigationPerformance(samples),{
  views:3,activationP50Ms:25,activationP95Ms:90,settledFrameP95Ms:230,
  slowestView:'employees',slowestSettledFrameMs:230,
  longTaskMeasuredViews:3,longTaskApiAvailableInAllViews:true,
  longTasksOver50ms:3,totalLongTaskMs:260,worstLongTaskMs:110
 });
 assert.equal(summarizeWorkspaceNavigationPerformance([]).views,0);
 const unsupported=summarizeWorkspaceNavigationPerformance([{view:'security',activateMs:30,settledFrameMs:70,longTaskSupported:false,longTaskCount:0,longTaskTotalMs:0,worstLongTaskMs:0}]);
 assert.equal(unsupported.longTaskMeasuredViews,0);
 assert.equal(unsupported.longTaskApiAvailableInAllViews,false);
 assert.equal(unsupported.longTasksOver50ms,null,'unsupported observer cannot report zero blocking tasks');
 assert.equal(unsupported.totalLongTaskMs,null);
});

// Execute the delivered collector, with a deterministic browser boundary.
test('click task overlap and pending observer records are included once',async()=>{
 const start=synthetic.indexOf('const perf=await page.evaluate(');
 const end=synthetic.indexOf('\n      assert(perf',start);
 const code=synthetic.slice(start,end).replace('const perf=await ', '');
 let drained=false;
 const state={current:{view:'people',clickedAt:105,activeAt:120},longTaskSupported:true,
  longTasks:[{start:10,duration:50},{start:100,duration:1500},{start:1900,duration:200}],
  observer:{takeRecords:()=>{if(drained)return [];drained=true;return [{startTime:1650,duration:100}];}}};
 const context={view:'people',globalThis:{__thebeSyntheticNavigationPerf:state},performance:{now:()=>1800},
  requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn(),page:{evaluate:fn=>fn('people')}};
 const perf=await vm.runInNewContext(code,context);
 assert.equal(perf.longTaskCount,2);
 assert.equal(perf.worstLongTaskMs,1500);
 assert.equal(perf.longTaskTotalMs,1600);
 assert.equal(perf.activateMs,15);
 const repeated=await vm.runInNewContext(code,context);
 assert.equal(repeated.longTaskCount,2,'drained entries must not be counted twice');
 assert.equal(repeated.longTaskTotalMs,1600);
});
