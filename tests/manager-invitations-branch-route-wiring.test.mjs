import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const w=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
test('scoped location and report route stays before invited manager deny gate',()=>{
 const scoped=w.indexOf('return createManagerScopedReadHttp({db:env.DB})(req');
 const denied=w.indexOf("manager_branch_access_pending");
 assert.ok(scoped>0&&denied>scoped);
 assert.match(w.slice(scoped-300,scoped),/managerInviteStage|my-locations|my-reports/);
});
test('owner grant and revoke remain in the central authenticated workspace gate',()=>{
 const auth=w.indexOf('if(url.pathname.startsWith("/api/"))');
 const csrf=w.indexOf('if(!mutationCsrfOk(req,a))',auth);
 const admin=w.indexOf('const handler=createManagerLocationAdminHttp(');
 assert.ok(auth>0&&csrf>auth&&admin>csrf);
 assert.match(w.slice(admin,admin+520),/authenticateOwner/);
 assert.match(w.slice(admin-270,admin),/managerInviteStage/);
});
