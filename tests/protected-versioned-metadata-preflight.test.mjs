import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProtectedMetadataDispatch,runProtectedMetadataRead} from '../scripts/protected-versioned-metadata-preflight.mjs';
const sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',GITHUB_EVENT_NAME:'workflow_dispatch',
 GITHUB_REF:'refs/heads/main',EXPECTED_SHA:sha,GITHUB_SHA:sha,PREFLIGHT_CONFIRM:'READ_ONLY_VERSIONED_PREFLIGHT',
 OPERATIONS_REHEARSAL_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d',OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN:'test'};
const result={restoreAuthorized:false,productionWriteAuthorized:false,retentionEnforced:false,restorePerformed:false};
test('dispatch refuses PRs, branches, missing approval confirmation and stale SHA',()=>{
 for(const patch of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/feature'},
 {PREFLIGHT_CONFIRM:'DO_NOT_RUN'},{EXPECTED_SHA:'c'.repeat(40)},{GITHUB_REPOSITORY:'other/repo'}]){
  assert.throws(()=>checkProtectedMetadataDispatch({...env,...patch}),/protected_versioned_metadata_hold/);
 }
});
test('read-only review returns HOLD and authenticates main before and after metadata reads',async()=>{
 let reads=0,inspection=0;
 const answer=await runProtectedMetadataRead({env,readMainSha:async()=>{reads++;return sha},
 inspect:async input=>{inspection++;assert.equal(reads,1);assert.equal(input.expectedMainSha,sha);return result}});
 assert.equal(reads,2);assert.equal(inspection,1);assert.equal(answer.restoreAuthorized,false);
 assert.equal(answer.revisionRechecked,true);assert.match(answer.disposition,/^HOLD_/);
});
test('refuses stale main before reads and after reads',async()=>{
 let called=0;
 await assert.rejects(()=>runProtectedMetadataRead({env,readMainSha:async()=>('b'.repeat(40)),
 inspect:async()=>{called++;return result}}),/protected_versioned_metadata_hold/);
 assert.equal(called,0);
 let times=0;
 await assert.rejects(()=>runProtectedMetadataRead({env,readMainSha:async()=>++times===1?sha:'b'.repeat(40),
 inspect:async()=>result}),/protected_versioned_metadata_hold/);
});
test('remote report cannot claim restore, retention enforcement or production authority',async()=>{
 for(const field of ['restoreAuthorized','productionWriteAuthorized','retentionEnforced','restorePerformed']){
  await assert.rejects(()=>runProtectedMetadataRead({env,readMainSha:async()=>sha,
   inspect:async()=>({...result,[field]:true})}),/protected_versioned_metadata_hold/);
 }
});
