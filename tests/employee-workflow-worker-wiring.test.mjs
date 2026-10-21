import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const worker=readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
test('Worker mounts workflow route in existing authenticated employee section',()=>{
 const employee=worker.indexOf('if(url.pathname==="/api/employees"&&req.method==="POST")');
 const workflow=worker.indexOf('if(url.pathname==="/api/employee-workflows")');
 assert.ok(workflow>0);
 assert.ok(employee>workflow);
 assert.ok(employee-workflow<1500);
 assert.match(worker,/handleEmployeeWorkflowRequest\(\{req,env,session:a,readJson,roleAllowed\}\)/);
});
test('Worker imports authenticated workflow adapter',()=>{
 assert.match(worker,/import \{handleEmployeeWorkflowRequest\} from "\.\/employee-workflow-api\.js";/);
});
