import test from 'node:test';
import assert from 'node:assert/strict';
import {checkC4PhaseBPrewrite} from '../scripts/c4-phase-b-prewrite-gate.mjs';
const main='6cc525962bab0ba57ac64a96599203cc3d08a623',account='ddd23cab31928a4bb3d4998df9b26d1d',database='abc83674-a1b3-4e71-8b93-497f0fb2c081';
const migration='48d90107bc80dffa9c06e9a3743e02466413476feb4da04ce34084aa0ed82ae4',baseline='28d169088e86d38e16688ccec122e1224c2ef01d135de263a239678d4d70a54d';
const url='https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2695#issuecomment-7062417550';
const fixtures=()=>({
 source:{mainSha:main,migrationSha256:migration,baselineSha256:baseline,hashMethod:'independent-raw-utf8-sha256',evidenceUrl:url},
 disposableD1:{accountId:account,id:database,name:'bw-c4-quotation-restore-rehearsal-20261121',applicationObjectCount:0,quickCheck:'ok',foreignKeyViolations:0,evidenceUrl:url},
 workersPlan:{tier:'paid',accountId:account,accountBoundProofUrl:url,verifiedAt:'2026-11-21T12:00:00Z'},
 executionPrincipal:{operatorId:'test-operator',accountId:account,d1EditVerified:true,timeTravelRestoreVerified:true,credentialScopeVerified:true,evidenceUrl:url,verifiedAt:'2026-11-21T12:01:00Z'},
 audit:{operatorId:'test-operator',accountId:account,databaseId:database,creationEventUrl:url,queryEventUrl:url},
 recovery:{retentionDays:30,bookmarkEligible:true,baselineRunbookReviewed:true,evidenceUrl:url,checkedAt:'2026-11-21T12:02:00Z'},
 independentReviewer:{login:'thusico',accountId:account,databaseId:database,mainSha:main,migrationSha256:migration,baselineSha256:baseline,accepted:true,approvalUrl:url,approvedAt:'2026-11-21T12:03:00Z'},
 owner:{login:'adinosassist-stack',accountId:account,databaseId:database,mainSha:main,migrationSha256:migration,baselineSha256:baseline,authorized:true,approvalUrl:'https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2695#issuecomment-7060544037',approvedAt:'2026-11-21T12:04:00Z'},
});
const check=(e,sha=main)=>checkC4PhaseBPrewrite({mainSha:sha,evidence:e});
test('missing evidence fails closed',()=>{const x=check({});assert.ok(x.blockers.length>=9);assert.equal(x.restoreAuthorized,false)});
test('complete looking evidence cannot authorize remote mutation',()=>{const x=check(fixtures());assert.equal(x.evidenceFieldsComplete,true);assert.equal(x.evidenceIndependentlyAuthenticated,false);assert.equal(x.sqlWriteAuthorized,false);assert.equal(x.restoreAuthorized,false);assert.equal(x.deploymentAuthorized,false)});
test('main SHA drift fails',()=>assert.ok(check(fixtures(),'a'.repeat(40)).blockers.includes('exact_main_sha_not_verified')));
test('wrong migration hash fails',()=>{const x=fixtures();x.source.migrationSha256='f'.repeat(64);assert.ok(check(x).blockers.includes('migration_checksum_not_verified'))});
test('wrong baseline hash fails',()=>{const x=fixtures();x.source.baselineSha256='f'.repeat(64);assert.ok(check(x).blockers.includes('baseline_checksum_not_verified'))});
test('wrong target database fails',()=>{const x=fixtures();x.disposableD1.id='prod';assert.ok(check(x).blockers.includes('disposable_resource_mismatch'))});
test('paid screenshot without account-bound evidence fails',()=>{const x=fixtures();x.workersPlan.accountBoundProofUrl='';assert.ok(check(x).blockers.includes('exact_account_paid_plan_unverified'))});
test('admin role without actual restore authority fails',()=>{const x=fixtures();x.executionPrincipal.timeTravelRestoreVerified=false;assert.ok(check(x).blockers.includes('effective_execution_authority_unverified'))});
test('operator audit mismatch fails',()=>{const x=fixtures();x.audit.operatorId='different';assert.ok(check(x).blockers.includes('operator_to_d1_audit_unverified'))});
test('unproven bookmark eligibility fails',()=>{const x=fixtures();x.recovery.bookmarkEligible=false;assert.ok(check(x).blockers.includes('time_travel_retention_and_runbook_unverified'))});
test('different reviewer fails',()=>{const x=fixtures();x.independentReviewer.login='adinosassist-stack';assert.ok(check(x).blockers.includes('independent_thusico_approval_missing'))});
test('owner approval ahead of reviewer fails',()=>{const x=fixtures();x.owner.approvedAt='2026-11-21T12:00:00Z';assert.ok(check(x).blockers.includes('separate_owner_execution_authorization_missing'))});
