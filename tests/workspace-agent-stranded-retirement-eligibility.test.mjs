import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessStrandedRetirement,PINNED,STRANDED,WORKER,STAGING_D1} from '../scripts/workspace-agent-stranded-retirement-eligibility.mjs';
const envelope=result=>({success:true,result});
function fixture(){
 const vars={
  AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',APP_ENV:'staging',PAYMENT_PROVIDER:'none',
  POP_UPLOAD_STAGING_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
  THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',
  WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:'false'
 };
 const pinnedBindings=Object.entries(vars).map(([name,text])=>({name,type:'plain_text',text}));
 const candidateBindings=[
  ...pinnedBindings.map(x=>x.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED'?{...x,text:'true'}:x),
  {name:'WORKSPACE_AGENT_ADVISORY_STAGING_HOST',type:'plain_text',text:'workspace-agent-staging.thebedesk.com'},
  {name:'SESSION_SECRET',type:'secret_text'},
  {name:'DB',type:'d1',id:STAGING_D1}
 ];
 return {
  versionsPage1:envelope({items:[{id:STRANDED,number:8},{id:PINNED,number:7}]}),
  versionsPage2:envelope({items:[]}),
  pinned:envelope({id:PINNED,bindings:pinnedBindings}),
  latest:envelope({id:STRANDED,bindings:candidateBindings}),
  settings:envelope({bindings:structuredClone(candidateBindings)}),
  deployments:envelope({deployments:[{versions:[{version_id:PINNED,percentage:100}]}]}),
  zones:{success:true,result:[],result_info:{total_count:0,total_pages:0}},
  scripts:envelope([{id:WORKER}]),
  subdomain:envelope({enabled:false,previews_enabled:false}),
  schedules:envelope({schedules:[]}),
  domains:envelope([]),
  database:envelope({uuid:STAGING_D1,name:WORKER,num_tables:0})
 };
}
test('classifies only an exact isolated two-version staging shape as eligible for a separate decision',()=>{
 const r=assessStrandedRetirement(fixture());
 assert.deepEqual(r,{eligibleForSeparateOwnerDecision:true,blockers:[],
  destructiveActionAuthorized:false,stagingDeploymentAuthorized:false,productionActionAuthorized:false});
});
test('never includes secret material or metadata from Cloudflare responses in output',()=>{
 const x=fixture();x.latest.result.bindings.push({name:'TOKEN',type:'secret_text',text:'TOP_SECRET'});
 const out=JSON.stringify(assessStrandedRetirement(x));
 assert.equal(out.includes('TOP_SECRET'),false);
 assert.equal(out.includes('TOKEN'),false);
 assert.equal(JSON.parse(out).eligibleForSeparateOwnerDecision,false);
});
test('does not allow any third or paginated version',()=>{
 const x=fixture();x.versionsPage2.result.items.push({id:'c2',number:9});
 assert.ok(assessStrandedRetirement(x).blockers.includes('version_history_not_exactly_two'));
});
test('refuses staging D1 writes or a different deployed Worker version',()=>{
 const x=fixture();x.database.result.num_tables=1;
 assert.equal(assessStrandedRetirement(x).eligibleForSeparateOwnerDecision,false);
 const y=fixture();y.deployments.result.deployments[0].versions[0].version_id=STRANDED;
 assert.ok(assessStrandedRetirement(y).blockers.includes('pinned_not_only_deployed_version'));
});
test('refuses candidate mismatch and missing script-settings provenance',()=>{
 const x=fixture();x.latest.result.id=PINNED;
 assert.equal(assessStrandedRetirement(x).eligibleForSeparateOwnerDecision,false);
 const y=fixture();y.settings.result.bindings[0].text='changed';
 assert.ok(assessStrandedRetirement(y).blockers.includes('script_settings_do_not_match_stranded'));
});
test('refuses public preview and routing exposure',()=>{
 const x=fixture();x.subdomain.result.previews_enabled=true;
 assert.equal(assessStrandedRetirement(x).eligibleForSeparateOwnerDecision,false);
 const y=fixture();y.domains.result.push({hostname:'unapproved.example'});
 assert.equal(assessStrandedRetirement(y).eligibleForSeparateOwnerDecision,false);
});
test('refuses missing snapshots and unknown inventory',()=>{
 assert.equal(assessStrandedRetirement().eligibleForSeparateOwnerDecision,false);
 const x=fixture();delete x.zones.result_info;
 assert.equal(assessStrandedRetirement(x).eligibleForSeparateOwnerDecision,false);
});
test('refuses a secret on the pinned inert version',()=>{
 const x=fixture();x.pinned.result.bindings[0]={name:'SESSION_SECRET',type:'secret_text'};
 assert.ok(assessStrandedRetirement(x).blockers.includes('pinned_inert_bindings_not_qualified'));
});
