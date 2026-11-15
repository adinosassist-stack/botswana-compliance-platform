import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyPinnedVersion} from '../scripts/workspace-agent-pinned-version-provenance.mjs';
test('fails closed on missing API responses',()=>{
 assert.equal(classifyPinnedVersion().valid,false);
});
test('fails closed on unverified version identity',()=>{
 const result=classifyPinnedVersion({pinned:{success:true,result:{id:'invalid',bindings:[]}},latest:{success:true,result:{id:'invalid'}},deployments:{}});
 assert.equal(result.valid,false);
 assert.equal(result.secretInheritanceFromLatestBlocked,true);
});

test('a mismatched latest version never permits inheritance',()=>{
 const expected='64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
 const fixture={
  pinned:{success:true,result:{id:expected,bindings:[
   {name:'SESSION_SECRET',type:'secret_text'},
   {name:'DB',type:'d1',id:'fa317ccc-683d-4466-9e3a-e296872d58ba'},
   {name:'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED',type:'plain_text',text:'true'}]}},
  latest:{success:true,result:{id:'9ba41e62-9efc-49c5-9d4e-d667057e43fb'}},
  deployments:{success:true,result:{deployments:[{versions:[{version_id:expected,percentage:100}]}]}}
 };
 const result=classifyPinnedVersion(fixture);
 assert.equal(result.valid,true);
 assert.equal(result.secretInheritanceFromLatestBlocked,true);
 fixture.pinned.result.bindings.pop();
 assert.equal(classifyPinnedVersion(fixture).valid,false);
});
