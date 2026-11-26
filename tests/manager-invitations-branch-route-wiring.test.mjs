import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const w=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
test('scoped location and report route stays before invited manager deny gate',()=>{
 const scoped=w.indexOf('return createManagerScopedReadHttp({db:env.DB,reviewEnabled:');
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


test('scoped dashboard path is admitted only inside invited manager grant path',()=>{
 const scoped=w.indexOf('return createManagerScopedReadHttp({db:env.DB,reviewEnabled:');
 const begin=w.lastIndexOf("if(managerInviteStage&&a.role==='manager')",scoped);
 assert.ok(begin>0&&scoped>begin);
 assert.match(w.slice(begin,scoped),/my-dashboard/);
 const denied=w.indexOf("manager_branch_access_pending",scoped);
 assert.ok(denied>scoped&&denied<scoped+1000);
});

test('report decision POST stays behind authenticated staging, origin, CSRF and explicit review gate',()=>{
 const auth=w.indexOf('if(url.pathname.startsWith("/api/"))');
 const csrf=w.indexOf('if(!mutationCsrfOk(req,a))',auth);
 const stage=w.indexOf("if(managerInviteStage&&a.role==='manager')",csrf);
 const post=w.indexOf("if(isScopedManager&&url.pathname==='/api/workspace/managers/my-reports'&&req.method==='POST')",stage);
 const deny=w.indexOf("manager_branch_access_pending",post);
 assert.ok(auth>0&&csrf>auth&&stage>csrf&&post>stage&&deny>post);
 const block=w.slice(post,w.indexOf("if(isScopedManager&&req.method==='GET'",post));
 assert.match(block,/if\(!managerDailyReviewEnabled\(env\)\)/);
 assert.match(block,/authRateLimit/);assert.match(block,/maxBytes:4096/);
 assert.match(block,/svc\.decide\(\{tenantId:a\.tenant_id,userId:a\.user_id,role:a\.role\},body\)/);
});
