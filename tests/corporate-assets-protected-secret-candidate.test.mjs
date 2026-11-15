import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEnvironmentPolicy,assertStagingHold,makeSecretPayload,
 candidateWranglerEnvironment,completeCandidateVersionIds,assertUnchangedActiveDeployment,
 verifyPrivateSecretCandidate} from '../scripts/corporate-assets-protected-secret-candidate.mjs';
const id='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const sha='a'.repeat(40);
const env={can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:true,reviewers:[{type:'User',reviewer:{login:'thusico'}}]}],
 deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
const text=(name,value)=>({name,type:'plain_text',text:value});
const bindings=[
 text('APP_ENV','staging'),text('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 text('ASSETS_STAGING_WRITES_ENABLED','false'),text('THEBE_CORPORATE_ASSETS_ENABLED','false'),
 text('ASSETS_STAGING_D1_ID',id),text('ASSETS_STAGING_SOURCE_SHA',sha),
 {name:'DB',type:'d1',database_id:id},
 text('SESSION_SECRET','synthetic-only'),text('AUDIT_INTEGRITY_SECRET','synthetic-only')
];
test('independent thusico review, self-review prevention and main-only policy required',()=>{
 assert.equal(validateEnvironmentPolicy(env,[{name:'main'}]),true);
 for(const [badEnv,branches] of [
 [{...env,protection_rules:[]},[{name:'main'}]],
 [{...env,protection_rules:[{...env.protection_rules[0],prevent_self_review:false}]},[{name:'main'}]],
 [{...env,protection_rules:[{...env.protection_rules[0],reviewers:[{type:'User',reviewer:{login:'owner'}}]}]},[{name:'main'}]],
 [env,[{name:'main'},{name:'test'}]],
 [env,[{name:'main',type:'tag'}]],
 [{...env,can_admins_bypass:true},[{name:'main',type:'branch'}]],
 [{...env,can_admins_bypass:undefined},[{name:'main',type:'branch'}]],
 [{...env,deployment_branch_policy:{custom_branch_policies:false,protected_branches:true}},[{name:'main'}]]
 ])assert.throws(()=>validateEnvironmentPolicy(badEnv,branches));
});
test('isolated D1 and disabled write/asset flags must hold before rotation',()=>{
 assert.equal(assertStagingHold(bindings,sha),true);
 for(const b of [
  bindings.map(x=>x.name==='DB'?{...x,database_id:'00000000-0000-4000-8000-000000000000'}:x),
  bindings.map(x=>x.name==='ASSETS_STAGING_WRITES_ENABLED'?{...x,text:'true'}:x),
  bindings.map(x=>x.name==='THEBE_CORPORATE_ASSETS_ENABLED'?{...x,text:'true'}:x),
  [...bindings,bindings[0]]
 ])assert.throws(()=>assertStagingHold(b,sha));
 assert.throws(()=>assertStagingHold(bindings,'b'.repeat(40)));
});
test('generate distinct cryptographically random staging secrets in memory only',()=>{
 const a=JSON.parse(makeSecretPayload()),b=JSON.parse(makeSecretPayload());
 assert.deepEqual(Object.keys(a).sort(),['AUDIT_INTEGRITY_SECRET','SESSION_SECRET']);
 assert.ok(a.SESSION_SECRET.length>=60 && a.AUDIT_INTEGRITY_SECRET.length>=60);
 assert.notEqual(a.SESSION_SECRET,a.AUDIT_INTEGRITY_SECRET);
 assert.notEqual(a.SESSION_SECRET,b.SESSION_SECRET);
});

const oldActiveVersion='5497120e-4ae6-4665-b96f-4b040d32a249';
const newCandidateVersion='11111111-2222-4333-8444-555555555555';
const previousIds=[oldActiveVersion,'983daaea-1e6b-4359-9994-0b792578008b','94d2b523-b36c-4d3e-935f-1606f1e78f0f'];
const deployment=()=>({deployments:[{id:'33e1d736-54f6-4a72-9087-cabed895dc99',
 created_on:'2026-11-05T19:23:03Z',versions:[{version_id:oldActiveVersion,percentage:100}]}]});
const candidate=()=>({id:newCandidateVersion,resources:{bindings:bindings.map(b=>
 ['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'].includes(b.name)?
 {...b,type:'secret_text',text:undefined}:b)}});
const qualified=()=>({beforeIds:previousIds,afterIds:[...previousIds,newCandidateVersion],
 version:candidate(),expectedSourceSha:sha,
 exposureBefore:{privateExposureVerified:true},exposureAfter:{privateExposureVerified:true},
 beforeDeployments:deployment(),afterDeployments:deployment()});
test('Wrangler credential rotation child inherits only dedicated token and basic OS paths',()=>{
 const env=candidateWranglerEnvironment('opaque-test-token',{
  PATH:'/usr/bin',HOME:'/tmp/test-home',
  GITHUB_TOKEN:'synthetic-github-secret',ASSETS_STAGING_GITHUB_READ_TOKEN:'synthetic-secret',
  SESSION_SECRET:'synthetic-secret',ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN:'synthetic-secret',
  NODE_OPTIONS:'--require unsafe',CLOUDFLARE_API_TOKEN:'wrong-token'
 });
 assert.equal(env.CLOUDFLARE_API_TOKEN,'opaque-test-token');
 assert.equal(env.CLOUDFLARE_ACCOUNT_ID,'ddd23cab31928a4bb3d4998df9b26d1d');
 assert.equal(env.WRANGLER_SEND_METRICS,'false');
 assert.equal(env.PATH,'/usr/bin');
 for(const name of ['GITHUB_TOKEN','ASSETS_STAGING_GITHUB_READ_TOKEN','SESSION_SECRET',
  'NODE_OPTIONS','ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN'])assert.equal(env[name],undefined);
 for(const bad of ['','Bearer invalid','value with spaces',' value'])assert.throws(()=>candidateWranglerEnvironment(bad));
});
test('version inventory must provide exactly one complete proven page',()=>{
 const good={result:{items:previousIds.map(id=>({id}))},
  result_info:{page:1,count:3,total_count:3}};
 assert.deepEqual(completeCandidateVersionIds(good),previousIds);
 for(const bad of [
  {...good,result_info:undefined},
  {...good,result_info:{page:1,count:3,total_count:4}},
  {...good,result_info:{page:2,count:3,total_count:3}},
  {...good,result_info:{page:1,count:3,total_count:3,total_pages:2}},
  {...good,result:{items:[{id:'bad'}]}},
  {...good,result:{items:[{id:previousIds[0]},{id:previousIds[0]}]}}
 ])assert.throws(()=>completeCandidateVersionIds(bad));
});
test('active version remains legacy v2 at 100 percent and no deployment changes allowed',()=>{
 assert.equal(assertUnchangedActiveDeployment(deployment(),deployment()),true);
 const split=deployment();split.deployments[0].versions[0].percentage=90;
 assert.throws(()=>assertUnchangedActiveDeployment(deployment(),split));
 const replacement=deployment();replacement.deployments[0].versions[0].version_id=newCandidateVersion;
 assert.throws(()=>assertUnchangedActiveDeployment(deployment(),replacement));
 const unexpected=deployment();unexpected.deployments.push({
  id:'4eae3ad9-1d47-4c54-8af6-15ed63597765',versions:[{version_id:oldActiveVersion,percentage:100}]});
 assert.throws(()=>assertUnchangedActiveDeployment(deployment(),unexpected));
});
test('one private candidate must have secret_text and isolated bindings; never authorizes deploy',()=>{
 const x=verifyPrivateSecretCandidate(qualified());
 assert.equal(x.newCandidateVersionId,newCandidateVersion);
 assert.equal(x.candidateBindingsSafe,true);
 assert.equal(x.oldActiveVersionStillUnsafe,true);
 assert.equal(x.deploymentAuthorized,false);
 assert.equal(x.productionChanged,false);
 assert.equal(x.sourceProvenanceVerified,false);
 for(const mutate of [
  a=>a.version.resources.bindings.find(b=>b.name==='SESSION_SECRET').type='plain_text',
  a=>a.version.resources.bindings.find(b=>b.name==='DB').database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
  a=>a.version.resources.bindings.find(b=>b.name==='THEBE_CORPORATE_ASSETS_ENABLED').text='true',
  a=>a.version.resources.bindings.find(b=>b.name==='ASSETS_STAGING_SOURCE_SHA').text='b'.repeat(40),
  a=>a.exposureAfter.privateExposureVerified=false,
  a=>a.exposureBefore.privateExposureVerified=false,
  a=>a.afterIds.push('22222222-2222-4222-8222-222222222222'),
  a=>a.version.id='22222222-2222-4222-8222-222222222222',
  a=>a.afterDeployments.deployments[0].versions[0].version_id=newCandidateVersion
 ]){
  const bad=qualified();mutate(bad);
  assert.throws(()=>verifyPrivateSecretCandidate(bad));
 }
});
