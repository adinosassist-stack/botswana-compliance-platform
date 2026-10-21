import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const runtime=readFileSync(new URL('../public/js/workspace-runtime-20261001b.js',import.meta.url),'utf8');
const start=runtime.indexOf('async function renderPeopleOperationsHub(){');
const end=runtime.indexOf('\nfunction renderPeopleInfographics(',start);
const people=runtime.slice(start,end);
test('People workflow editor is behind existing owner manager role gate',()=>{
 assert.match(people,/roleCanView\("peopleops"\)/);
 assert.match(people,/\["owner","manager"\]\.includes\(currentWorkspaceRole\(\)\)/);
 assert.match(people,/employeeWorkflowPanel/);
});
test('People editor loads without blocking employee summary requests',()=>{
 assert.match(people,/import\("\.\.\/employee-workflow-panel\.js"\)\.then/);
 assert.match(people,/Promise\.allSettled\(\[apiJson\("\/api\/employees"\)/);
});
