import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyVersionedSqlBytes} from '../scripts/verify-versioned-private-candidate-local.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const sql=`CREATE TABLE tenants(id TEXT PRIMARY KEY);
CREATE TABLE users(id TEXT PRIMARY KEY);
CREATE TABLE memberships(id TEXT PRIMARY KEY);
CREATE TABLE sessions(id TEXT PRIMARY KEY);
CREATE TABLE audit_events(id TEXT PRIMARY KEY);
CREATE TABLE evidence(id TEXT PRIMARY KEY);
INSERT INTO tenants VALUES('synthetic-tenant');
INSERT INTO users VALUES('synthetic-user');`;
const fixture=(run,size)=>{
 const bytes=Buffer.from(sql+'\n'+' '.repeat(size-Buffer.byteLength(sql)-1));
 const receipt={kind:'private_production_backup_candidate',accountId:'ddd23cab31928a4bb3d4998df9b26d1d',
 databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',bucket:'bw-compliance-ops-backups',
 sourceSha:'a'.repeat(40),runId:String(run),attempt:'1',
 candidateKey:`candidates/${run}/1/production-d1.sql`,bytes:size,sha256:digest(bytes),
 exportBookmark:'synthetic-bookmark-123',privateRoundtripVerified:true};
 return {receipt,bytes};
};
test('both exact known candidates verify independently yet still return HOLD',()=>{
 for(const [run,size] of [[41709222476,3224706],[41710740133,3225845]]){
  const {receipt,bytes}=fixture(run,size);
  const o=verifyVersionedSqlBytes(receipt,bytes);
  assert.equal(o.privateBytesMatchedReceipt,true);
  assert.equal(o.sqliteIntegrityPassed,true);
  assert.equal(o.status,'HOLD_INDEPENDENT_PROVENANCE_RETENTION_AND_RESTORE_APPROVAL');
  for(const k of ['receiptOriginIndependentlyVerified','exportBookmarkIndependentlyVerified','storageRetentionEnforced',
   'representativeObjectVerified','tenantIsolationAccepted','restoreExecuted','productionWriteAuthorized'])assert.equal(o[k],false);
  assert.doesNotMatch(JSON.stringify(o),/synthetic-tenant|synthetic-user|CREATE TABLE/);
 }
});
test('rejects a different candidate even with internally consistent receipt and bytes',()=>{
 const {receipt,bytes}=fixture(41709222476,3224706);
 receipt.runId='41710000000';receipt.candidateKey='candidates/41710000000/1/production-d1.sql';
 assert.throws(()=>verifyVersionedSqlBytes(receipt,bytes),/candidate_not_reviewed/);
});
test('rejects altered bytes and receipt hash mismatch',()=>{
 const {receipt,bytes}=fixture(41709222476,3224706);
 const altered=Buffer.from(bytes);altered[altered.length-1]=10;
 assert.throws(()=>verifyVersionedSqlBytes(receipt,altered),/sha256_mismatch/);
 assert.throws(()=>verifyVersionedSqlBytes({...receipt,sha256:'b'.repeat(64)},bytes),/sha256_mismatch/);
 assert.throws(()=>verifyVersionedSqlBytes(receipt,bytes.subarray(0,-1)),/byte_length/);
});
test('rejects synthetic invalid SQLite even if expected hashes match',()=>{
 const {receipt,bytes}=fixture(41709222476,3224706);
 bytes.fill(32);bytes.write('NOT SQL;',0,'utf8');receipt.sha256=digest(bytes);
 assert.throws(()=>verifyVersionedSqlBytes(receipt,bytes),/sqlite_integrity/);
});
test('rejects additional receipt fields, unsafe authority and unknown object types',()=>{
 const {receipt,bytes}=fixture(41709222476,3224706);
 assert.throws(()=>verifyVersionedSqlBytes({...receipt,signedUrl:'secret'},bytes),/unexpected_fields/);
 assert.throws(()=>verifyVersionedSqlBytes({...receipt,databaseId:'different'},bytes),/authority/);
 assert.throws(()=>verifyVersionedSqlBytes(receipt,'not bytes'),/byte_length/);
});
