/**
 * C4 Phase B evidence screening only. No network calls, writes or restores.
 * Evidence URLs and attestations must still be independently authenticated.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const SHA40=/^[a-f0-9]{40}$/,SHA64=/^[a-f0-9]{64}$/;
const expected=Object.freeze({
 accountId:'ddd23cab31928a4bb3d4998df9b26d1d',
 databaseId:'abc83674-a1b3-4e71-8b93-497f0fb2c081',
 databaseName:'bw-c4-quotation-restore-rehearsal-20261121',
 migration:'48d90107bc80dffa9c06e9a3743e02466413476feb4da04ce34084aa0ed82ae4',
 baseline:'28d169088e86d38e16688ccec122e1224c2ef01d135de263a239678d4d70a54d',
});
const url=s=>typeof s==='string'&&/^https:\/\/[^\s/@]+(?:\/[^\s]*)?$/.test(s);
const time=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s)&&Number.isFinite(Date.parse(s));
export function checkC4PhaseBPrewrite({mainSha,evidence={}}={}){
 const blocks=[],need=(yes,why)=>{if(!yes)blocks.push(why)};
 const s=evidence.source||{},d=evidence.disposableD1||{},p=evidence.workersPlan||{},e=evidence.executionPrincipal||{},a=evidence.audit||{},rec=evidence.recovery||{},rev=evidence.independentReviewer||{},o=evidence.owner||{};
 need(SHA40.test(mainSha||'')&&s.mainSha===mainSha,'exact_main_sha_not_verified');
 need(SHA64.test(s.migrationSha256||'')&&s.migrationSha256===expected.migration,'migration_checksum_not_verified');
 need(SHA64.test(s.baselineSha256||'')&&s.baselineSha256===expected.baseline,'baseline_checksum_not_verified');
 need(s.hashMethod==='independent-raw-utf8-sha256'&&url(s.evidenceUrl),'hash_evidence_unverified');
 need(d.accountId===expected.accountId&&d.id===expected.databaseId&&d.name===expected.databaseName,'disposable_resource_mismatch');
 need(d.applicationObjectCount===0&&d.quickCheck==='ok'&&d.foreignKeyViolations===0&&url(d.evidenceUrl),'disposable_readonly_integrity_unverified');
 need(p.tier==='paid'&&p.accountId===expected.accountId&&url(p.accountBoundProofUrl)&&time(p.verifiedAt),'exact_account_paid_plan_unverified');
 need(e.accountId===expected.accountId&&e.d1EditVerified===true&&e.timeTravelRestoreVerified===true&&e.credentialScopeVerified===true&&typeof e.operatorId==='string'&&e.operatorId.length>0&&url(e.evidenceUrl)&&time(e.verifiedAt),'effective_execution_authority_unverified');
 need(a.accountId===expected.accountId&&a.databaseId===expected.databaseId&&a.operatorId===e.operatorId&&url(a.creationEventUrl)&&url(a.queryEventUrl),'operator_to_d1_audit_unverified');
 need(rec.retentionDays===30&&rec.bookmarkEligible===true&&rec.baselineRunbookReviewed===true&&url(rec.evidenceUrl)&&time(rec.checkedAt),'time_travel_retention_and_runbook_unverified');
 need(rev.login==='thusico'&&rev.accountId===expected.accountId&&rev.databaseId===expected.databaseId&&rev.mainSha===mainSha&&rev.migrationSha256===expected.migration&&rev.baselineSha256===expected.baseline&&rev.accepted===true&&url(rev.approvalUrl)&&time(rev.approvedAt),'independent_thusico_approval_missing');
 need(o.login==='adinosassist-stack'&&o.accountId===expected.accountId&&o.databaseId===expected.databaseId&&o.mainSha===mainSha&&o.migrationSha256===expected.migration&&o.baselineSha256===expected.baseline&&o.authorized===true&&url(o.approvalUrl)&&time(o.approvedAt)&&time(rev.approvedAt)&&Date.parse(o.approvedAt)>Date.parse(rev.approvedAt)&&o.approvalUrl!==rev.approvalUrl,'separate_owner_execution_authorization_missing');
 return Object.freeze({evaluation:'C4_PHASE_B_OFFLINE_EVIDENCE_SCREEN',inputMainSha:mainSha||null,resource:expected.databaseName,blockers:Object.freeze([...new Set(blocks)]),evidenceFieldsComplete:blocks.length===0,evidenceIndependentlyAuthenticated:false,sqlWriteAuthorized:false,restoreAuthorized:false,deploymentAuthorized:false});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [file,mainSha]=process.argv.slice(2);
 if(!file||!SHA40.test(mainSha||'')){console.error('Usage: node scripts/c4-phase-b-prewrite-gate.mjs evidence.json <exact-main-sha>');process.exitCode=2}
 else{try{const result=checkC4PhaseBPrewrite({mainSha,evidence:JSON.parse(readFileSync(file,'utf8'))});console.log(JSON.stringify(result,null,2));process.exitCode=result.blockers.length?1:0}catch{console.error('Invalid/unreadable evidence JSON');process.exitCode=2}}
}
