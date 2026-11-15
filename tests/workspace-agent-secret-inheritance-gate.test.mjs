import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditSecretInheritance,PINNED_INERT_VERSION,D1_ID} from '../scripts/workspace-agent-secret-inheritance-gate.mjs';
function make() {
 const vars={
  AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
  POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
  THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
  WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'true',
  WORKSPACE_AGENT_ADVISORY_STAGING_HOST:'workspace-agent-staging.thebedesk.com'
 };
 return {
  settings:{success:true,result:{bindings:[
   ...Object.entries(vars).map(([name,text])=>({type:'plain_text',name,text})),
   {type:'secret_text',name:'SESSION_SECRET'},
   {type:'d1',name:'DB',id:D1_ID}
  ]}},
  deployments:{success:true,result:{deployments:[{versions:[{version_id:PINNED_INERT_VERSION,percentage:100}]}]}},
  versions:{success:true,result:{items:[{id:PINNED_INERT_VERSION}]}}
 };
}
test('allows only fully verified source identity for human review',()=>{
 assert.deepEqual(auditSecretInheritance(make()),{readyForHumanPayloadReview:true,errors:[]});
});
test('rejects stranded latest upload even when inert deployment is 100 percent',()=>{
 const x=make();x.versions.result.items[0].id='9ba41e62-9efc-49c5-9d4e-d667057e43fb';
 assert.ok(auditSecretInheritance(x).errors.includes('latest_uploaded_version_not_verified_pinned_inert'));
});
test('rejects unknown latest response schema',()=>{
 const x=make();x.versions.result={versions:[{id:PINNED_INERT_VERSION}]};
 assert.equal(auditSecretInheritance(x).readyForHumanPayloadReview,false);
});
test('rejects changed or duplicated secrets',()=>{
 const x=make();x.settings.result.bindings.push({type:'secret_text',name:'EXTRA_SECRET'});
 assert.ok(auditSecretInheritance(x).errors.includes('secret_binding_identity_mismatch'));
});
test('rejects missing D1 and unexpected variable changes',()=>{
 const x=make();x.settings.result.bindings.find(b=>b.name==='DB').id='wrong';
 x.settings.result.bindings.find(b=>b.name==='APP_ENV').text='production';
 assert.ok(auditSecretInheritance(x).errors.includes('expected_d1_mismatch'));
 assert.ok(auditSecretInheritance(x).errors.includes('plain_text_binding_mismatch'));
});
test('rejects missing responses',()=>{
 assert.equal(auditSecretInheritance().readyForHumanPayloadReview,false);
});
