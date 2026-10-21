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
test('production entry injects isolated workflow loader and uses central API',()=>{
 assert.ok(entry.includes('employee-workflow-people-loader.js'));
 assert.ok(loader.includes('BW?.api?.createClient'));
 assert.ok(!loader.includes('fetch('));
});
test('People workflow loader supports keyboard navigation and checks visibility',()=>{
 assert.ok(loader.includes('addEventListener("keydown"'));
 assert.ok(loader.includes('people.hidden||!people.getClientRects().length'));
});

test('People workflow loader caches explicit access denials only',()=>{
 assert.match(loader,/let accessDenied=false/);
 assert.match(loader,/loading\|\|mounted\|\|accessDenied/);
 assert.match(loader,/\[401,403\]\.includes\(Number\(error\?\.status\)\)/);
 assert.doesNotMatch(loader,/accessDenied=true;return;\}\s*finally/);
});
