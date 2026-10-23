import assert from 'node:assert/strict';
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
 assert.match(synthetic,/task\.duration>=50/);
 assert.match(synthetic,/requestAnimationFrame\(\(\)=>setTimeout\(\(\)=>requestAnimationFrame\(resolve\),0\)\)/);
 assert.match(synthetic,/WORKSPACE_NAV_SAMPLE /);
 assert.match(synthetic,/WORKSPACE_NAV_PERF_SUMMARY /);
 assert.match(synthetic,/navigationPerfSamples\.length===views\.length/);
});

test('navigation summary uses nearest-rank p95 and keeps route slugs only',()=>{
 const samples=[
  {view:'dashboard',activateMs:10,settledFrameMs:30,longTaskCount:0,longTaskTotalMs:0,worstLongTaskMs:0},
  {view:'security',activateMs:25,settledFrameMs:140,longTaskCount:2,longTaskTotalMs:180,worstLongTaskMs:110},
  {view:'employees',activateMs:90,settledFrameMs:230,longTaskCount:1,longTaskTotalMs:80,worstLongTaskMs:80},
  {view:'unsafe path / PII',activateMs:500,settledFrameMs:8000,longTaskCount:9,longTaskTotalMs:800,worstLongTaskMs:300}
 ];
 assert.deepEqual(summarizeWorkspaceNavigationPerformance(samples),{
  views:3,activationP50Ms:25,activationP95Ms:90,settledFrameP95Ms:230,
  slowestView:'employees',slowestSettledFrameMs:230,
  longTasksOver50ms:3,totalLongTaskMs:260,worstLongTaskMs:110
 });
 assert.equal(summarizeWorkspaceNavigationPerformance([]).views,0);
});
