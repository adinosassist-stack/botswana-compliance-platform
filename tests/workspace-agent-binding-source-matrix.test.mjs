import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBindingSources,PINNED_VERSION,ISOLATED_D1} from '../scripts/workspace-agent-binding-source-matrix.mjs';
const STRANDED='9ba41e62-9efc-49c5-9d4e-d667057e43fb';
const envelope=result=>({success:true,result});
function fixture(){
 const clean=[{name:'APP_ENV',type:'plain_text',text:'staging'},
 {name:'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED',type:'plain_text',text:'false'}];
 const changed=[{name:'APP_ENV',type:'plain_text',text:'staging'},
 {name:'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED',type:'plain_text',text:'true'},
 {name:'DB',type:'d1',id:ISOLATED_D1},
 {name:'SESSION_SECRET',type:'secret_text',text:'PRIVATE_FIXTURE_NEVER_LOG'}];
 return {
  pinned:envelope({id:PINNED_VERSION,bindings:clean}),
  latest:envelope({id:STRANDED,bindings:changed}),
  scriptSettings:envelope({bindings:changed}),
  deployments:envelope({deployments:[{versions:[{version_id:PINNED_VERSION,percentage:100}]}]})
 };
}
test('separates clean pinned configuration from unsafe latest/script settings',()=>{
 const r=reconcileBindingSources(fixture());
 assert.equal(r.valid,true);
 assert.equal(r.latestEqualsPinned,false);
 assert.equal(r.sources.pinned.d1Binding,'absent');
 assert.equal(r.sources.pinned.sessionSecret,'absent');
 assert.equal(r.sources.pinned.advisoryFlag,'false');
 assert.equal(r.sources.scriptSettings.d1Binding,'expected');
 assert.equal(r.sources.scriptSettings.sessionSecret,'present');
 assert.equal(r.topologyMatches.scriptPinned,false);
 assert.equal(r.topologyMatches.scriptLatest,true);
 assert.equal(r.mutationsAuthorized,false);
});
test('never includes raw secrets or unrecognized binding names in output',()=>{
 const r=JSON.stringify(reconcileBindingSources(fixture()));
 assert.equal(r.includes('PRIVATE_FIXTURE_NEVER_LOG'),false);
 assert.equal(r.includes('APP_ENV'),false);
 assert.equal(r.includes('SESSION_SECRET'),false);
});
test('refuses unknown bindings without logging their names',()=>{
 const x=fixture();x.latest.result.bindings.push({type:'queue',name:'UNKNOWN_QUEUE_NAME'});
 const r=reconcileBindingSources(x);
 assert.equal(r.valid,false);
 assert.ok(r.issues.includes('latest_unexpected_binding_type'));
 assert.equal(JSON.stringify(r).includes('UNKNOWN_QUEUE_NAME'),false);
});
test('refuses missing responses and changed deployment allocation',()=>{
 assert.equal(reconcileBindingSources().valid,false);
 const x=fixture();x.deployments.result.deployments[0].versions[0].percentage=0;
 assert.ok(reconcileBindingSources(x).issues.includes('deployed_version_allocation_unverified'));
});
test('reports unexpected D1 binding without claiming a fix',()=>{
 const x=fixture();x.scriptSettings.result.bindings.find(v=>v.name==='DB').id='incorrect';
 const r=reconcileBindingSources(x);
 assert.equal(r.sources.scriptSettings.d1Binding,'unexpected');
 assert.equal(r.mutationsAuthorized,false);
});
