import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
test('invited branch managers fail closed before workspace data handlers',()=>{
 const gate=worker.indexOf("if(managerInviteStage&&a.role==='manager')");
 const after=worker.indexOf('const staffManager=await handleStaffManager');
 assert.ok(gate>0&&gate<after);
 const b=worker.slice(gate,gate+900);
 assert.match(b,/accepted_by_user_id=\?/);
 assert.match(b,/status='accepted'/);
 assert.match(b,/manager_branch_access_pending/);
 assert.match(b,/\/api\/auth\/me/);
 assert.match(b,/\/api\/auth\/logout/);
 assert.doesNotMatch(b,/tenantId.*req\.body/);
});
