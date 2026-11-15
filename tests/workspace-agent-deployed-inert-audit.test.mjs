import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectInertDeployed,PINNED_INERT,KNOWN_UNSAFE_LATEST} from '../scripts/workspace-agent-deployed-inert-audit.mjs';
const expected={
 AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
 POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
 THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
 WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false'
};
function fixture(){
 return {
 pinned:{success:true,result:{id:PINNED_INERT,bindings:Object.entries(expected).map(([name,text])=>({type:'plain_text',name,text}))}},
 latest:{success:true,result:{id:KNOWN_UNSAFE_LATEST}},
 deployments:{success:true,result:{deployments:[{versions:[{version_id:PINNED_INERT,percentage:100}]}]}}
 };
}
test('accepts only exact pinned inert binding values and keeps latest promotion blocked',()=>{
 assert.deepEqual(inspectInertDeployed(fixture()),{deployedInertSafe:true,latestPromotionBlocked:true,issues:[]});
});
test('refuses any secret, D1 or other resource on the deployed pinned version',()=>{
 const x=fixture();x.pinned.result.bindings[0]={type:'secret_text',name:'SESSION_SECRET'};
 assert.equal(inspectInertDeployed(x).deployedInertSafe,false);
 const y=fixture();y.pinned.result.bindings[0]={type:'d1',name:'DB',id:'other'};
 assert.equal(inspectInertDeployed(y).deployedInertSafe,false);
});
test('refuses activation or a missing advisory shell variable',()=>{
 const x=fixture();x.pinned.result.bindings.find(b=>b.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED').text='true';
 assert.ok(inspectInertDeployed(x).issues.includes('inert_binding_value_or_type_mismatch'));
});
test('refuses changed latest upload, different deployed allocation, and missing API',()=>{
 const x=fixture();x.latest.result.id=PINNED_INERT;
 assert.ok(inspectInertDeployed(x).issues.includes('latest_upload_identity_changed'));
 const y=fixture();y.deployments.result.deployments[0].versions[0].percentage=0;
 assert.ok(inspectInertDeployed(y).issues.includes('pinned_deployment_changed'));
 assert.equal(inspectInertDeployed().deployedInertSafe,false);
});
test('refuses duplicate names and unexpected plain text variables',()=>{
 const x=fixture();x.pinned.result.bindings[0].name='APP_ENV';
 assert.equal(inspectInertDeployed(x).deployedInertSafe,false);
});
test('never returns binding content, token, or Cloudflare modification action',()=>{
 const x=fixture();const out=JSON.stringify(inspectInertDeployed(x));
 assert.equal(out.includes('APP_ENV'),false);
 assert.equal(out.includes('settings'),false);
});
