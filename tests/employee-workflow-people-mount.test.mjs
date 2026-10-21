import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const runtime=readFileSync(new URL('../public/js/workspace-runtime-20261001b.js',import.meta.url),'utf8');
const panel=readFileSync(new URL('../public/employee-workflow-panel.js',import.meta.url),'utf8');
test('workflow panel remains separately loadable without modifying canonical workspace runtime',()=>{
 assert.match(panel,/mountEmployeeWorkflowBuilder/);
 assert.match(runtime,/async function renderPeopleOperationsHub\(\)/);
 assert.doesNotMatch(runtime,/employeeWorkflowPanel/);
});
test('People dashboard retains progressive employee loading',()=>{
 assert.match(runtime,/Promise\.allSettled\(\[apiJson\("\/api\/employees"\)/);
});

const loader=readFileSync(new URL('../public/js/employee-workflow-people-loader.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../cloudflare/src/production-entry.js',import.meta.url),'utf8');
test('production entry injects the isolated workflow loader without changing canonical runtime',()=>{
 assert.match(entry,/employee-workflow-people-loader\\.js/);
 assert.match(loader,/BW\\?\\.api\\?\\.createClient/);
 assert.doesNotMatch(loader,/\\bfetch\\s*\\(/);
});
test('People workflow loader supports keyboard navigation and checks view visibility after loading',()=>{
 assert.match(loader,/addEventListener\\("keydown"/);
 assert.match(loader,/people\\.hidden\\|\\|!people\\.getClientRects\\(\\)\\.length/);
});
