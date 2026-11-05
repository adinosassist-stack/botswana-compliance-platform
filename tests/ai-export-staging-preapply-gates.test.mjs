import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {inspectExportStagingPreapply} from '../scripts/inspect-ai-export-staging-preapply.mjs';
import {buildReviewManifest} from '../scripts/prepare-ai-export-staging-schema-review.mjs';
import {schemaPath} from '../scripts/qualify-ai-export-staging-schema-offline.mjs';
const ddl=readFileSync(schemaPath,'utf8');
const sourceSha='b4d1a73be0f5fd58551b68a9f4f075c7ef844e01';
const reviewManifest=buildReviewManifest({sourceSha,ddl});
const now=1800000000000;
const inventory={accountId:'ddd23cab31928a4bb3d4998df9b26d1d',
 databaseId:'ee6ddc6b-9de7-43f5-97e8-39442f1d1135',
 changedDb:false,rowsWritten:0,applicationObjects:[]};
const ownerApproval={sourceSha,schemaSha256:reviewManifest.schemaSha256,
 accountId:inventory.accountId,databaseId:inventory.databaseId,
 scope:'ISOLATED_AI_EXPORT_STAGING_SCHEMA_ONLY',role:'owner',author:'owner-account',
 recordId:'owner-approval',expiresAt:now+60000};
const reviewerApproval={...ownerApproval,role:'independent_reviewer',
 author:'thusico',recordId:'reviewer-approval'};
const base={sourceSha,reviewManifest,ddl,inventory,ownerApproval,reviewerApproval,now};
test('even structurally qualified approvals never trigger or authorize application',()=>{
 const result=inspectExportStagingPreapply(base);
 assert.equal(result.ok,true);
 assert.equal(result.approvedToApply,false);
 assert.equal(result.productionReady,false);
 assert.equal(result.remoteMutations,0);
 assert.equal(result.requiresAuthenticatedGithubApprovalProvenance,true);
});
test('missing approvals, shared authors, expired attestations all hold',()=>{
 for(const changes of [
  {ownerApproval:undefined},
  {reviewerApproval:undefined},
  {reviewerApproval:{...reviewerApproval,author:'owner-account'}},
  {reviewerApproval:{...reviewerApproval,expiresAt:now}},
  {ownerApproval:{...ownerApproval,scope:'PRODUCTION'}},
  {reviewerApproval:{...reviewerApproval,recordId:'owner-approval'}}]){
  const result=inspectExportStagingPreapply({...base,...changes});
  assert.equal(result.ok,false);assert.equal(result.approvedToApply,false);
 }
});
test('unknown schema or stale main SHA must hold',()=>{
 for(const changes of [
  {sourceSha:'a'.repeat(40)},
  {ddl:ddl+'\nDROP TABLE anything;'},
  {reviewManifest:{...reviewManifest,stagingDatabaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'}}
 ])assert.equal(inspectExportStagingPreapply({...base,...changes}).ok,false);
});
test('nonempty or mutated remote schema inventory must hold',()=>{
 for(const inv of [
  {...inventory,databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'},
  {...inventory,applicationObjects:['ai_document_export_jobs']},
  {...inventory,changedDb:true},
  {...inventory,rowsWritten:1},
  {...inventory,applicationObjects:undefined}
 ])assert.equal(inspectExportStagingPreapply({...base,inventory:inv}).ok,false);
});
