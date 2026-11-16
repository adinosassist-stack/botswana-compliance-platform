import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProtectedProvenanceContext,inspectProtectedProvenance} from '../scripts/corporate-assets-protected-provenance-preflight.mjs';
import {inspectEarlyMain,requireFreshDispatchedMain} from '../scripts/corporate-assets-early-main-guard.mjs';
import {ACCOUNT,WORKER,CANDIDATE,ROLLBACK,DB} from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';
const sha='a'.repeat(40),old='0'.repeat(39)+'1';
const env={can_admins_bypass:false,protection_rules:[{type:'required_reviewers',prevent_self_review:true,
 reviewers:[{type:'User',reviewer:{login:'thusico'}}]}],deployment_branch_policy:{custom_branch_policies:true,protected_branches:false}};
const branches=[{name:'main',type:'branch'}];
const info={repository:'adinosassist-stack/botswana-compliance-platform',ref:'refs/heads/main',
 githubSha:sha,expectedSha:sha,mainSha:sha,environment:env,branches};
const plain=(name,text)=>({name,type:'plain_text',text});
const candidate={id:CANDIDATE,number:3,resources:{bindings:[
 plain('APP_ENV','staging'),plain('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 plain('ASSETS_STAGING_SOURCE_SHA',old),plain('ASSETS_STAGING_D1_ID',DB),
 plain('THEBE_CORPORATE_ASSETS_ENABLED','false'),plain('ASSETS_STAGING_WRITES_ENABLED','false'),
 plain('PAYMENT_PROVIDER','none'),plain('REGISTRATION_MODE','hold'),
 ...['EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'].map(n=>plain(n,'false')),
 {name:'DB',type:'d1',database_id:DB},{name:'SESSION_SECRET',type:'secret_text'},{name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}
]}};
const deployments={success:true,result:{deployments:[{id:'previous',created_on:'2026-11-05T19:23:03Z',versions:[{version_id:ROLLBACK,percentage:100}]}]},
 result_info:{page:1,total_pages:1,count:1}};
function mock({headSha=sha,badReview=false}={}){
 const calls=[];
 const request=async(url,options)=>{
  calls.push({url,method:options.method});
  let response;
  if(url.endsWith('/commits/main'))response={sha:headSha};
  else if(url.endsWith('/environments/corporate-assets-staging-protected'))
   response=badReview?{...env,can_admins_bypass:true}:env;
  else if(url.includes('/deployment-branch-policies?'))response={branch_policies:branches};
  else if(url.endsWith('/versions/'+CANDIDATE))response={success:true,result:candidate};
  else if(url.endsWith('/deployments'))response=deployments;
  else throw Error('unexpected_url');
  return {ok:true,json:async()=>response};
 };
 return {calls,request};
}
const receiptCollector=({expectedSha})=>({reviewedCommit:expectedSha,manifestDigest:'a'.repeat(64),
 deploymentAuthorized:false,cloudflareArtifactVerified:false});
const args=()=>({...info,githubToken:'synthetic-github',cloudflareToken:'synthetic-cloudflare',receiptCollector});
test('protected main policy requires reviewer, exact live main and no admin bypass',()=>{
 assert.equal(checkProtectedProvenanceContext(info),true);
 for(const mutator of [
  x=>x.mainSha='b'.repeat(40),x=>x.githubSha='b'.repeat(40),
  x=>x.ref='refs/heads/test',x=>x.environment.can_admins_bypass=true,
  x=>x.branches.push({name:'dev'})
 ]){
  const x={...info,environment:structuredClone(env),branches:structuredClone(branches)};
  mutator(x);assert.throws(()=>checkProtectedProvenanceContext(x));
 }
});
test('read-only protected receipt never claims build upload or deployment',async()=>{
 const {calls,request}=mock();
 const result=await inspectProtectedProvenance({...args(),request});
 assert.equal(result.exactSourceUploadVerified,false);
 assert.equal(result.uploadAuthorized,false);
 assert.equal(result.deploymentAuthorized,false);
 assert.equal(result.existingCandidate,CANDIDATE);
 assert.ok(result.oldCandidateErrors.includes('source_sha_mismatch'));
 assert.equal(calls.length,5);
 assert.ok(calls.every(x=>x.method==='GET'));
 assert.ok(calls.every(x=>x.url.startsWith('https://api.github.com/')||x.url.startsWith('https://api.cloudflare.com/')));
});
test('stale main and failed independent review deny access to Cloudflare calls',async()=>{
 for(const config of [{headSha:'b'.repeat(40)},{badReview:true}]){
  const m=mock(config);
  await assert.rejects(inspectProtectedProvenance({...args(),request:m.request}));
  assert.equal(m.calls.filter(x=>x.url.includes('cloudflare')).length,0);
 }
});
test('missing tokens and wrong trigger ref rejected',async()=>{
 await assert.rejects(inspectProtectedProvenance({...args(),githubToken:''}),/dedicated_staging_tokens_required/);
 await assert.rejects(inspectProtectedProvenance({...args(),ref:'refs/heads/dev'}),/exact_protected_main_sha_required/);
});
test('invalid offline input receipt rejected without release',async()=>{
 const m=mock();
 await assert.rejects(inspectProtectedProvenance({...args(),request:m.request,
  receiptCollector:()=>({...receiptCollector({expectedSha:sha}),cloudflareArtifactVerified:true})}),/invalid_offline_build_receipt/);
});
test('Cloudflare HTTP failure and malformed envelope fail closed',async()=>{
 const m=mock();
 const request=async(url,opts)=>url.includes('cloudflare')?{ok:false,status:403}:m.request(url,opts);
 await assert.rejects(inspectProtectedProvenance({...args(),request}),/protected_metadata_read_failed_403/);
 const other=async(url,opts)=>url.endsWith('/deployments')?
  {ok:true,json:async()=>({success:false})}:m.request(url,opts);
 await assert.rejects(inspectProtectedProvenance({...args(),request:other}),/cloudflare_metadata_invalid/);
});

test('early main guard rejects stale, mismatched and malformed dispatch before protected review',async()=>{
 const base={repository:info.repository,ref:'refs/heads/main',githubSha:sha,expectedSha:sha,token:'synthetic-github'};
 const get=async(url,options)=>{
  assert.equal(options.method,'GET');
  assert.equal(url,'https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/commits/main');
  return {ok:true,json:async()=>({sha})};
 };
 const result=await inspectEarlyMain({...base,request:get});
 assert.equal(result.protectedRecheckStillRequired,true);
 assert.equal(result.deploymentAuthorized,false);
 assert.equal(requireFreshDispatchedMain({...base,liveSha:sha}),true);
 await assert.rejects(inspectEarlyMain({...base,request:async()=>({ok:true,json:async()=>({sha:old})})}),/early_exact_main_sha_required/);
 for(const bad of [{githubSha:old},{ref:'refs/heads/dev'},{expectedSha:old},{repository:'other/repo'}]){
  await assert.rejects(inspectEarlyMain({...base,...bad,request:()=>{throw Error('should_not_call_network')}}),/early_exact_main_sha_required/);
 }
 await assert.rejects(inspectEarlyMain({...base,token:''}),/github_read_token_required/);
 await assert.rejects(inspectEarlyMain({...base,request:async()=>({ok:false,status:403})}),/early_main_read_failed/);
});
