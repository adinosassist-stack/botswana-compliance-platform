import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {assertWorkspaceNavigationResponsiveness} from '../scripts/workspace-navigation-performance-summary.mjs';
const sample=(extra={})=>({view:'protecthub',activateMs:15,settledFrameMs:413,longTaskSupported:true,worstLongTaskMs:63,...extra});
test('responsive navigation passes even when hydration waits on the network',()=>{
 assert.doesNotThrow(()=>assertWorkspaceNavigationResponsiveness([sample({settledFrameMs:12000})]));
});
test('multi-second activation and blocking tasks fail the freeze regression',()=>{
 assert.throws(()=>assertWorkspaceNavigationResponsiveness([sample({activateMs:6835})]),/activation/);
 assert.throws(()=>assertWorkspaceNavigationResponsiveness([sample({worstLongTaskMs:6890})]),/blocking/);
 assert.doesNotThrow(()=>assertWorkspaceNavigationResponsiveness([sample({activateMs:2000,worstLongTaskMs:1000})]));
});
test('missing or invalid evidence cannot pass the regression',()=>{
 for(const samples of [[],[sample({longTaskSupported:false})],[sample({activateMs:NaN})],[sample({worstLongTaskMs:undefined})],[sample({view:'private / identity'})]])assert.throws(()=>assertWorkspaceNavigationResponsiveness(samples));
});
test('initial and repeat navigation both have complete coverage and independent guards',()=>{
 const source=readFileSync(new URL('../scripts/production-synthetic-full-user-wrapper.mjs',import.meta.url),'utf8');
 assert.match(source,/for\(const navigationPass of \['initial','repeat'\]\)/);
 assert.match(source,/WORKSPACE_NAV_PASS_SUMMARY /);
 assert.match(source,/assertWorkspaceNavigationResponsiveness\(navigationPerfSamples\)/);
 assert.match(source,/navigationPerfSamples\.length===views\.length/);
});
