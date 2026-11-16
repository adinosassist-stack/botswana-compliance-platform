import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessInertSnapshot,INERT_VERSION,STAGING_D1,STAGING_NAME} from '../scripts/workspace-agent-inert-settings-audit.mjs';
const wrap=result=>({success:true,result});
function sample() {
 const bindings=[
  ['AGENT_BOUNDED_TASK_EXECUTION_ENABLED','0'],['APP_ENV','staging'],
  ['PAYMENT_PROVIDER','none'],['POP_UPLOAD_STAGING_ENABLED','false'],
  ['THEBE_GENERAL_AI_ENABLED','false'],['THEBE_INTERNAL_AUTONOMY_ENABLED','false'],
  ['THEBE_LIVE_VOICE_ENABLED','false'],
  ['WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED','true'],
 ].map(([name,text])=>({type:'plain_text',name,text}));
 bindings.push({name:'DB',type:'d1',id:STAGING_D1});
 return {
  deployments:wrap({deployments:[{versions:[{version_id:INERT_VERSION,percentage:100}]}]}),
  settings:wrap({bindings}), subdomain:wrap({enabled:false,previews_enabled:false}),
  schedules:wrap({schedules:[]}),domains:wrap([]),
  database:wrap({uuid:STAGING_D1,name:STAGING_NAME,num_tables:0})
 };
}
test('accept only the explicitly observed isolated mismatch for further security review',()=>{
 const r=assessInertSnapshot(sample());
 assert.equal(r.safe,true); assert.deepEqual(r.issues,[]);
});
test('never accept secret binding that cannot be safely reconstructed',()=>{
 const s=sample();s.settings.result.bindings.push({type:'secret_text',name:'SESSION_SECRET'});
 assert.equal(assessInertSnapshot(s).safe,false);
 assert.ok(assessInertSnapshot(s).issues.includes('secret_or_unknown_binding_requires_independent_procedure'));
});
test('reject an additional D1 or any changed D1 binding identity',()=>{
 const s=sample();s.settings.result.bindings.push({type:'d1',name:'PRODUCTION_DB',id:'wrong'});
 assert.ok(assessInertSnapshot(s).issues.includes('unexpected_resource_binding'));
});
test('reject unknown extra plain text variables rather than silently remove them',()=>{
 const s=sample();s.settings.result.bindings.push({type:'plain_text',name:'WORKSPACE_AGENT_ADVISORY_STAGING_HOST',text:'x'});
 assert.ok(assessInertSnapshot(s).issues.includes('unknown_or_missing_plain_text_binding'));
});
test('reject advisory flag already false to avoid unnecessary write',()=>{
 const s=sample();s.settings.result.bindings.find(x=>x.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED').text='false';
 assert.ok(assessInertSnapshot(s).issues.includes('no_expected_advisory_flag_mismatch'));
});
test('reject unknown deployed version allocation',()=>{
 const s=sample();s.deployments.result.deployments[0].versions[0].percentage=0;
 assert.ok(assessInertSnapshot(s).issues.includes('pinned_version_not_100pct'));
});
test('reject nonempty dedicated D1',()=>{
 const s=sample();s.database.result.num_tables=1;
 assert.ok(assessInertSnapshot(s).issues.includes('dedicated_d1_not_empty'));
});
test('fail closed on missing Cloudflare responses',()=>{
 assert.equal(assessInertSnapshot({}).safe,false);
 assert.equal(assessInertSnapshot(null).safe,false);
});
