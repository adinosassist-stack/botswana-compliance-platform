// Offline evidence binding for versioned, private D1 backup candidates.
// This module cannot approve a backup or read, restore, mutate, or publish private data.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const SHA=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const BOOKMARK=/^[A-Za-z0-9._:-]{8,300}$/;
export const isValidBookmark = value => typeof value === 'string' && BOOKMARK.test(value);
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const DATABASE='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const BUCKET='bw-compliance-ops-backups';
const fail=code=>{throw Error('pop_candidate_evidence_hold_'+code)};
function requireString(value,regexp,code){
 if(typeof value!=='string'||!regexp.test(value))fail(code);
 return value;
}
export function validateCandidateReceipt(input,{expectedMainSha}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('invalid_receipt');
 const keys=['kind','accountId','databaseId','bucket','sourceSha','runId','attempt','candidateKey','bytes','sha256','exportBookmark','privateRoundtripVerified'];
 // Strictly reject unknown fields: never accidentally persist signed URLs, tokens, SQL bytes, or tenant information.
 if(Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key)))fail('unexpected_fields');
 if(input.kind!=='private_production_backup_candidate'||input.accountId!==ACCOUNT||input.databaseId!==DATABASE||input.bucket!==BUCKET)fail('authority');
 const sourceSha=requireString(input.sourceSha,GIT_SHA,'source_sha');
 if(expectedMainSha!==undefined&&sourceSha!==expectedMainSha)fail('stale_source');
 if(!/^[1-9][0-9]*$/.test(String(input.runId))||!/^[1-9][0-9]*$/.test(String(input.attempt)))fail('run_identity');
 const expectedKey=`candidates/${input.runId}/${input.attempt}/production-d1.sql`;
 if(input.candidateKey!==expectedKey)fail('candidate_key_mismatch');
 if(!Number.isSafeInteger(input.bytes)||input.bytes<1||input.bytes>25*1024*1024)fail('size');
 const sha256=requireString(input.sha256,SHA,'sha256');
 const exportBookmark=requireString(input.exportBookmark,BOOKMARK,'export_bookmark');
 if(input.privateRoundtripVerified!==true)fail('roundtrip_missing');
 return Object.freeze({
  kind:'private_candidate_evidence_review',
  sourceSha,runId:String(input.runId),attempt:String(input.attempt),
  candidateKey:expectedKey,bytes:input.bytes,sha256,exportBookmark,
  identityAndReceiptFormatValidated:true,privateRoundtripAttestedByWorkflow:true,
  remotelyVerifiedSha256:false,retentionApproved:false,restoreApproved:false,
  tenantIsolationApproved:false,rollbackApproved:false,
  productionWriteAuthorized:false,productionMigrationExecuted:false,
  popIngestionEnabled:false,subscriptionActivated:false,
  disposition:'HOLD_INDEPENDENT_EVIDENCE_AND_RECOVERY_APPROVAL_REQUIRED'
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)fail('input_required');
  const data=JSON.parse(readFileSync(process.argv[2],'utf8'));
  console.log(JSON.stringify(validateCandidateReceipt(data,{expectedMainSha:process.env.EXPECTED_MAIN_SHA}),null,2));
 }catch(e){console.error(String(e?.message||'').startsWith('pop_candidate_evidence_hold_')?e.message:'pop_candidate_evidence_hold_invalid_input');process.exitCode=2}
}
