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


test('functional manager staging requires verified schema and Access, never just staging mode',()=>{
 const gate=source.slice(source.indexOf('const managerInviteStage='),source.indexOf('const isManagerInviteActivation='));
 assert.match(gate,/MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED/);
 assert.match(gate,/MANAGER_INVITATIONS_SCHEMA_READY/);
 assert.match(gate,/MANAGER_INVITATIONS_ACCESS_READY/);
 const login=source.slice(source.indexOf('let managerLandingPath=null;'),source.indexOf('let managerLandingPath=null;')+620);
 assert.match(login,/MANAGER_INVITATIONS_SCHEMA_READY/);
 assert.match(login,/MANAGER_INVITATIONS_ACCESS_READY/);
 const html=source.slice(source.indexOf("if(url.pathname.startsWith('/manager-invite/'))"),source.indexOf("if(url.pathname.startsWith('/manager-invite/'))")+650);
 assert.match(html,/MANAGER_INVITATIONS_SCHEMA_READY/);
 assert.match(html,/MANAGER_INVITATIONS_ACCESS_READY/);
 const config=fs.readFileSync(new URL('../cloudflare/wrangler.manager-invitations-staging.toml',import.meta.url),'utf8');
 for(const key of ['MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED','MANAGER_INVITATIONS_SCHEMA_READY','MANAGER_INVITATIONS_ACCESS_READY'])
  assert.match(config,new RegExp(key+' = "false"'));
});
