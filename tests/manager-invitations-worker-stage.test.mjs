import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
test('manager invitations are explicitly staging-only and default off',()=>{
 const guard=source.indexOf("const managerInviteStage=");
 assert.ok(guard>0);
 assert.match(source.slice(guard,guard+280),/APP_ENV/);
 assert.match(source.slice(guard,guard+280),/==='staging'/);
 assert.match(source.slice(guard,guard+280),/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED/);
});
test('manager activation and owner invitation use existing Cloudflare auth boundaries',()=>{
 const init=source.indexOf("if(isManagerInviteActivation&&managerInviteStage)");
 const generic=source.indexOf('if(url.pathname.startsWith("/api/"))');
 assert.ok(init>0&&init<generic);
 const owner=source.indexOf("if(managerInviteStage&&url.pathname==='/api/workspace/managers/invitations'");
 const cookie=source.lastIndexOf('const a=await auth(req,env);',owner);
 const csrf=source.lastIndexOf('if(!mutationCsrfOk(req,a))',owner);
 assert.ok(cookie>=0&&csrf>cookie&&owner>csrf);
 const section=source.slice(owner,owner+1000);
 assert.match(section,/authenticateOwner/);assert.match(section,/verifyCsrf/);
});
