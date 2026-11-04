import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCandidateRetentionPolicy,readCandidateRetentionPolicy} from '../scripts/check-private-backup-retention-readonly.mjs';

const valid=()=>({success:true,result:{rules:[{id:'thebe-backup-candidates-30-day-immutable-20261103',
  enabled:true,prefix:'candidates/',condition:{type:'Age',maxAgeSeconds:2592000}}]}});
test('exact readback matches policy but cannot certify irreversible object retention',()=>{
 const result=inspectCandidateRetentionPolicy(valid());
 assert.equal(result.exactPolicyReadbackMatched,true);
 assert.equal(result.configuredRetentionDays,30);
 assert.equal(result.retentionEnforced,false);
 assert.equal(result.existingObjectRetentionIndependentlyVerified,false);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.productionWriteAuthorized,false);
 assert.match(result.disposition,/^HOLD_/);
});
test('missing, disabled, unrelated or drifted rules fail closed',()=>{
 for(const rules of [[],[{}],[{...valid().result.rules[0],enabled:false}],
 [{...valid().result.rules[0],prefix:''}],
 [{...valid().result.rules[0],prefix:'approved/'}],
 [{...valid().result.rules[0],condition:{type:'Age',maxAgeSeconds:120}}],
 [{...valid().result.rules[0],id:'other'}],
 [...valid().result.rules,{id:'other',enabled:true,prefix:'else/',condition:{type:'Age',maxAgeSeconds:2592000}}]]) {
 assert.throws(()=>inspectCandidateRetentionPolicy({success:true,result:{rules}}),/r2_retention_readback_hold_/);
 }
});
test('malformed provider response fails before claims',()=>{
 for(const p of [null,{}, {success:false,result:{rules:valid().result.rules}}, {success:true,result:{}}, {success:true,result:{rules:'unknown'}}])
 assert.throws(()=>inspectCandidateRetentionPolicy(p),/r2_retention_readback_hold_/);
});
test('GET only, private account/bucket, and no policy mutation',async()=>{
 const calls=[];
 const fetchImpl=async (url,options)=>{
  calls.push({url,method:options.method});
  return Response.json(valid());
 };
 const result=await readCandidateRetentionPolicy({accountId:'ddd23cab31928a4bb3d4998df9b26d1d',token:'synthetic',fetchImpl});
 assert.equal(result.exactPolicyReadbackMatched,true);
 assert.deepEqual(calls,[{url:'https://api.cloudflare.com/client/v4/accounts/ddd23cab31928a4bb3d4998df9b26d1d/r2/buckets/bw-compliance-ops-backups/lock',method:'GET'}]);
});
test('authorization failure makes zero remote calls',async()=>{
 let calls=0;
 await assert.rejects(readCandidateRetentionPolicy({accountId:'0'.repeat(32),token:'synthetic',fetchImpl:async()=>{calls++;return Response.json(valid())}}),/authority/);
 assert.equal(calls,0);
});
test('failed and malformed GET never fallback to write',async()=>{
 for(const response of [new Response(null,{status:403}),new Response('not-json',{status:200})]){
  let calls=0;
  await assert.rejects(readCandidateRetentionPolicy({accountId:'ddd23cab31928a4bb3d4998df9b26d1d',token:'synthetic',fetchImpl:async(_,o)=>{calls++;assert.equal(o.method,'GET');return response;}}),/r2_retention_readback_hold_/);
  assert.equal(calls,1);
 }
});
