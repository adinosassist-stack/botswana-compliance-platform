// Restricted-operator, local-byte qualification of exactly two private versioned SQL candidates.
// NEVER fetches data, writes a database, selects a restore target, or grants restore authority.
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateCandidateReceipt} from './qualify-private-pop-backup-evidence-offline.mjs';
import {inspectBackup} from './isolated-operations-rehearsal.mjs';

const CANDIDATES=new Map([
 ['candidates/41709222476/1/production-d1.sql',3224706],
 ['candidates/41710740133/1/production-d1.sql',3225845],
]);
const fail=code=>{throw Error('versioned_candidate_hold_'+code)};
export function verifyVersionedSqlBytes(receipt,bytes){
 const candidate=validateCandidateReceipt(receipt);
 const expectedBytes=CANDIDATES.get(candidate.candidateKey);
 if(expectedBytes===undefined)fail('candidate_not_reviewed');
 if(!Buffer.isBuffer(bytes)||bytes.length!==expectedBytes||bytes.length!==candidate.bytes)fail('byte_length');
 const actual=createHash('sha256').update(bytes).digest('hex');
 if(actual!==candidate.sha256)fail('sha256_mismatch');
 let sql;
 try{sql=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail('encoding')}
 let inventory;
 try{inventory=inspectBackup(sql)}catch{fail('sqlite_integrity')}
 const rowCountsSha256=createHash('sha256').update(JSON.stringify(inventory.counts)).digest('hex');
 // Receipt format alone does not establish independent source, bookmark or signer provenance.
 // SQL validity alone does not establish recoverability, tenancy correctness or RPO.
 return {
  kind:'versioned_private_candidate_local_bytes_review',
  candidateKey:candidate.candidateKey,sqlBytes:bytes.length,actualSqlSha256:actual,
  claimedExportBookmark:candidate.exportBookmark,claimedSourceSha:candidate.sourceSha,
  sqliteIntegrityPassed:true,foreignKeyViolations:0,tableCount:inventory.tableCount,rowCountsSha256,
  privateBytesMatchedReceipt:true,receiptOriginIndependentlyVerified:false,
  exportBookmarkIndependentlyVerified:false,storageRetentionEnforced:false,
  representativeObjectVerified:false,tenantIsolationAccepted:false,
  restoreExecuted:false,productionWriteAuthorized:false,
  status:'HOLD_INDEPENDENT_PROVENANCE_RETENTION_AND_RESTORE_APPROVAL'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==4)fail('receipt_and_local_sql_required');
  const receipt=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const size=statSync(process.argv[3]).size;
  if(size<1||size>25*1024*1024)fail('file_size');
  console.log(JSON.stringify(verifyVersionedSqlBytes(receipt,readFileSync(process.argv[3])),null,2));
 }catch(e){
  const message=String(e?.message||'');
  console.error(/^(versioned_candidate_hold_|pop_candidate_evidence_hold_)/.test(message)?message:'versioned_candidate_hold_invalid_private_input');
  process.exitCode=2;
 }
}
