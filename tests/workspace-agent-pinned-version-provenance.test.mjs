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
