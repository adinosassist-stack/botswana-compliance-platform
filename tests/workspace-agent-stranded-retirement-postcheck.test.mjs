import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessRetirementPostconditions} from '../scripts/workspace-agent-stranded-retirement-postcheck.mjs';
import {PINNED,WORKER,STAGING_D1,STRANDED} from '../scripts/workspace-agent-stranded-retirement-eligibility.mjs';
const E=result=>({success:true,result});
function fixtures(){
 const p={AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',
 PAYMENT_PROVIDER:'none',POP_UPLOAD_STAGING_ENABLED:'false',
 THEBE_GENERAL_AI_ENABLED:'false',THEBE_INTERNAL_AUTONOMY_ENABLED:'false',
 THEBE_LIVE_VOICE_ENABLED:'false',WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false'};
 const b=Object.entries(p).map(([name,text])=>({name,text,type:'plain_text'}));
 return {versionsPage1:E({items:[{id:PINNED,number:1}]}),versionsPage2:E({items:[]}),
 pinned:E({id:PINNED,bindings:b}),latest:E({id:PINNED,bindings:structuredClone(b)}),
 settings:E({bindings:structuredClone(b)}),
 deployments:E({deployments:[{versions:[{version_id:PINNED,percentage:100}]}]}),
 zones:{success:true,result:[],result_info:{total_count:0}},scripts:E([{id:WORKER}]),
 subdomain:E({enabled:false,previews_enabled:false}),schedules:E({schedules:[]}),
 domains:E([]),database:E({uuid:STAGING_D1,name:WORKER,num_tables:0})};
}
test('only exactly pinned inert version, script settings, empty database and isolation qualify',()=>{
 assert.deepEqual(assessRetirementPostconditions(fixtures()),{
  verified:true,blockers:[],agentActivationAuthorized:false,productionActionAuthorized:false
 });
});
test('stranded upload still present fails postcondition',()=>{
 const x=fixtures();x.versionsPage1.result.items.push({id:STRANDED,number:2});
 assert.ok(assessRetirementPostconditions(x).blockers.includes('version_list_not_only_pinned'));
});
test('stale latest version or mismatched service settings fails closed',()=>{
 const x=fixtures();x.latest.result.id=STRANDED;
 assert.ok(assessRetirementPostconditions(x).blockers.includes('latest_version_not_verified_inert'));
 const y=fixtures();y.settings.result.bindings[0].text='different';
 assert.ok(assessRetirementPostconditions(y).blockers.includes('script_settings_not_verified_inert'));
});
test('resource or secret binding in pinned version fails closed',()=>{
 const x=fixtures();x.pinned.result.bindings[0]={type:'d1',name:'DB',id:STAGING_D1};
 assert.equal(assessRetirementPostconditions(x).verified,false);
});
test('preserve 100% pinned and D1 emptiness',()=>{
 const x=fixtures();x.deployments.result.deployments[0].versions[0].percentage=25;
 assert.equal(assessRetirementPostconditions(x).verified,false);
 const y=fixtures();y.database.result.num_tables=1;
 assert.ok(assessRetirementPostconditions(y).blockers.includes('dedicated_d1_changed'));
});
test('any missing snapshots fail closed',()=>{
 assert.equal(assessRetirementPostconditions().verified,false);
});
test('public routes or previews fail postcondition',()=>{
 const x=fixtures();x.subdomain.result.previews_enabled=true;
 assert.ok(assessRetirementPostconditions(x).blockers.includes('subdomain_or_previews_enabled'));
 const y=fixtures();y.domains.result.push({name:'example.com'});
 assert.ok(assessRetirementPostconditions(y).blockers.includes('custom_domain_created'));
});
