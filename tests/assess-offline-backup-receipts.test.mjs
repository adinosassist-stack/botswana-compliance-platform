import test from 'node:test';
import assert from 'node:assert/strict';
import {assessOfflineReceiptWindow} from '../scripts/assess-offline-backup-receipts.mjs';
const sourceSha='a'.repeat(40),end='2026-11-04T12:00:00Z';
const receipt=(n,time,patch={})=>({
 kind:'private_production_backup_candidate',sourceSha,
 accountId:'ddd23cab31928a4bb3d4998df9b26d1d',
 databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
 bucket:'bw-compliance-ops-backups',candidateKey:`candidates/${n}/1/production-d1.sql`,
 runId:String(n),attempt:'1',sha256:'b'.repeat(64),bytes:3277137,
 privateRoundtripVerified:true,exportBookmark:'bookmark-'+n,receiptTime:time,...patch
});
const assess=r=>assessOfflineReceiptWindow(r,{sourceSha,observedAt:end});
test('offline complete candidate history remains a HOLD, never grants restore or RPO',()=>{
 const records=Array.from({length:25},(_,i)=>receipt(i+1,new Date(Date.parse(end)-(24-i)*3600000).toISOString()));
 const a=assess(records);
 assert.equal(a.candidateCadenceWithinThreshold,true);
 assert.equal(a.sustainedRpoQualified,false);
 assert.equal(a.restoreAuthorized,false);
 assert.equal(a.productionWriteAuthorized,false);
 assert.equal(a.disposition,'HOLD_PROVIDER_EVIDENCE_AND_INDEPENDENT_ACCEPTANCE');
});
test('newest receipt cannot hide an earlier long gap',()=>{
 const a=assess([receipt(1,'2026-11-03T12:05:00Z'),receipt(2,'2026-11-04T11:59:00Z')]);
 assert.equal(a.candidateCadenceWithinThreshold,false);
 assert.equal(a.disposition,'HOLD_CANDIDATE_CADENCE_GAP');
});
test('empty, missing and sparse histories never qualify',()=>{
 for(const r of [[],[receipt(1,'2026-11-04T11:59:00Z')], [receipt(1,'2026-11-03T11:00:00Z')]])
 assert.equal(assess(r).candidateCadenceWithinThreshold,false);
});
test('duplicated candidate key and mismatched identity fail closed',()=>{
 for(const r of [[receipt(1,end),receipt(1,end)],[receipt(1,end,{runId:'5'})]])
 assert.throws(()=>assess(r),/duplicate_or_identity/);
});
test('untrusted incorrect sources, hashes, timestamps and private readback fail closed',()=>{
 for(const patch of [{sourceSha:'c'.repeat(40)},{sha256:'bad'},{receiptTime:'not a time'},
  {receiptTime:'2026-11-05T00:00:00Z'},{privateRoundtripVerified:false},
  {bucket:'public'},{bytes:0},{exportBookmark:''}])
 assert.throws(()=>assess([receipt(1,end,patch)]),/candidate_receipt_hold_/);
});
test('no configured source or unsupported threshold is accepted',()=>{
 assert.throws(()=>assessOfflineReceiptWindow([],{sourceSha:'bad',observedAt:end}),/authority_or_bounds/);
 assert.throws(()=>assessOfflineReceiptWindow([],{sourceSha,observedAt:end,maxGapMinutes:240}),/authority_or_bounds/);
});
