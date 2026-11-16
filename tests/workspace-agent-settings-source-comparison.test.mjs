import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareWorkerSettingsSources} from '../scripts/workspace-agent-settings-source-comparison.mjs';
const pin='64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
const other='9ba41e62-9efc-49c5-9d4e-d667057e43fb';
const bindings=()=>[
  {name:'SESSION_SECRET',type:'secret_text'},
  {name:'DB',type:'d1',id:'fa317ccc-683d-4466-9e3a-e296872d58ba'},
  {name:'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED',type:'plain_text',text:'true'}
];
function sample(){
 return {
  version:{success:true,result:{id:pin,bindings:[]}},
  script:{success:true,result:{bindings:bindings()}},
  latest:{success:true,result:{id:other}},
  deployments:{success:true,result:{deployments:[{versions:[{version_id:pin,percentage:100}]}]}}
 };
}
test('separates script-level bindings from pinned version and blocks repair',()=>{
 const x=compareWorkerSettingsSources(sample());
 assert.equal(x.verified,true);
 assert.equal(x.sourcesDiffer,true);
 assert.equal(x.pinnedVersion.sessionSecret,'absent');
 assert.equal(x.scriptSettings.sessionSecret,'present');
 assert.equal(x.scriptSettings.d1,'present');
 assert.equal(x.scriptSettings.advisoryFlag,'true');
 assert.equal(x.repairBlocked,true);
});
test('does not confuse same-looking sources with latest uploaded version',()=>{
 const x=sample();x.version.result.bindings=bindings();
 const y=compareWorkerSettingsSources(x);
 assert.equal(y.sourcesDiffer,false);assert.equal(y.latestIsPinned,false);
 assert.equal(y.repairBlocked,true);
});
test('rejects unexpected binding identity without displaying values',()=>{
 const x=sample();x.script.result.bindings[1].id='unknown';
 const y=compareWorkerSettingsSources(x);
 assert.equal(y.scriptSettings.d1,'unexpected');
 assert.ok(!JSON.stringify(y).includes('unknown'));
});
test('rejects missing metadata and deployment changes',()=>{
 assert.equal(compareWorkerSettingsSources().verified,false);
 const x=sample();x.deployments.result.deployments[0].versions[0].percentage=0;
 assert.ok(compareWorkerSettingsSources(x).issues.includes('inert_deployment_changed'));
});
