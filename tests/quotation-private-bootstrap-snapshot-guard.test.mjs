import test from 'node:test';
import assert from 'node:assert/strict';
import {assessQuotationNoCostBootstrapSnapshot as assess} from
 '../scripts/quotation-private-bootstrap-snapshot-guard.mjs';
const ok=()=>{
 const name='bw-quotation-auth-private-staging';
 const account='ddd23cab31928a4bb3d4998df9b26d1d';
 return {accountId:account,expectedAccountId:account,workerName:name,
   expectedWorkerName:name,subdomain:{enabled:false,previews_enabled:false},
   deployments:[],routes:[],customDomains:[],bindings:[],
   scripts:[{id:name}],hasPreviewInvocability:false};
};
test('all post-bootstrap GET evidence is required',()=>{
 assert.deepEqual(assess(ok()),{safeForSeparateCandidateAuthorization:true,
   failures:[]});
});
test('missing/unverified evidence always denies progress',()=>{
 assert.equal(assess({}).safeForSeparateCandidateAuthorization,false);
 for(const k of ['subdomain','deployments','routes','customDomains',
   'bindings','scripts','hasPreviewInvocability']){
   const o=ok();delete o[k];
   assert.equal(assess(o).safeForSeparateCandidateAuthorization,false,k);
 }
});
test('either workers.dev or Version URLs blocks real code upload',()=>{
 for(const flag of ['enabled','previews_enabled']){
  const o=ok();o.subdomain[flag]=true;
  assert.equal(assess(o).safeForSeparateCandidateAuthorization,false);
 }
});
test('unauthorized routes, bindings, deployment, duplicate or reachable preview are blocked',()=>{
 const cases=[
  {deployments:[{id:'deployed'}]},
  {routes:['example.com/*']},
  {customDomains:['public.example.com']},
  {bindings:[{name:'AUTH_DB',type:'d1'}]},
  {hasPreviewInvocability:true},
  {scripts:[{id:'bw-quotation-auth-private-staging'},{id:'bw-quotation-auth-private-staging'}]}
 ];
 for(const patch of cases)assert.equal(assess({...ok(),...patch})
    .safeForSeparateCandidateAuthorization,false,JSON.stringify(patch));
});
