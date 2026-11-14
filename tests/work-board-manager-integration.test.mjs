import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manager=readFileSync(new URL('../public/js/employee-self-service-manager.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../cloudflare/src/employee-self-service.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../public/js/work-board-renderer.js',import.meta.url),'utf8');

test('manager reads tasks via existing authenticated client, never direct fetch',()=>{
 assert.match(manager,/client\.request\("\/api\/employee-self-service\/tasks"\)/);
 assert.match(manager,/managerTasksToWorkBoard\(\{response:data,tenantId:data\.tenantId,today\}\)/);
 assert.match(manager,/renderWorkBoard\(boardHost,/);
 assert.doesNotMatch(manager,/fetch\(/);
});
test('manager task response supplies tenant from authenticated server principal',()=>{
 assert.match(worker,/const method=request\.method,path=url\.pathname,tenantId=auth\.tenant_id/);
 assert.match(worker,/if\(path==="\/api\/employee-self-service\/tasks"&&method==="GET"\)/);
 assert.match(worker,/return json\(\{items:rows\.results\|\|\[\],tenantId\}\)/);
 assert.match(worker,/WHERE t\.tenant_id=\?/);
});
test('read-only board has no mutation controls and renders via textContent',()=>{
 assert.match(renderer,/name\.textContent=task\.title/);
 assert.doesNotMatch(renderer,/innerHTML|insertAdjacentHTML|addEventListener|\.fetch\(/);
 assert.doesNotMatch(renderer,/method:\s*["']POST/);
});

test('failed manager refresh clears previously displayed task data',()=>{
 assert.match(manager,/catch\(error\) \{ boardHost\.replaceChildren\(\); list\.replaceChildren\(\); throw error; \}/);
});
test('overdue dates use Botswana calendar',()=>{
 assert.match(manager,/timeZone:"Africa\/Gaborone"/);
});
