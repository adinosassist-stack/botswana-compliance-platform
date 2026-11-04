import test from 'node:test';
import assert from 'node:assert/strict';
import {assessIsolatedVersionedPreflight,readIsolatedVersionedPreflight,EVIDENCE} from '../scripts/qualify-isolated-versioned-preflight.mjs';
const sha='b'.repeat(40);
const valid=()=>({expectedMainSha:sha,observedMainSha:sha,
 lock:{success:true,result:{rules:[{id:EVIDENCE.lockId,enabled:true,prefix:'candidates/',condition:{type:'Age',maxAgeSeconds:2592000}}]}},
 objects:{success:true,result:[{key:EVIDENCE.candidateKey,size:3224706}]},
 target:{success:true,result:{uuid:EVIDENCE.targetId,name:EVIDENCE.targetName,num_tables:0}}});
test('metadata preflight cannot grant restore, retention enforcement or production write',()=>{
 const x=assessIsolatedVersionedPreflight(valid());
 for(const k of ['objectBytesRehashed','foreignKeysInspected','objectDeleteBlockedObserved','retentionEnforced','restoreAuthorized','restorePerformed','productionWriteAuthorized'])assert.equal(x[k],false);
 assert.match(x.disposition,/^HOLD_/);
});
test('rejects drifted lock policy and malformed lock response',()=>{
 const v=valid();
 for(const patch of [
 {lock:{success:false,result:v.lock.result}},{lock:{success:true,result:{rules:[]}}},
 {lock:{success:true,result:{rules:[...v.lock.result.rules,{id:'other'}]}}},
 {lock:{success:true,result:{rules:[{...v.lock.result.rules[0],prefix:'candidates'}]}}},
 {lock:{success:true,result:{rules:[{...v.lock.result.rules[0],enabled:false}]}}},
 {lock:{success:true,result:{rules:[{...v.lock.result.rules[0],condition:{type:'Age',maxAgeSeconds:120}}]}}},
 ])assert.throws(()=>assessIsolatedVersionedPreflight({...v,...patch}),/versioned_preflight_hold_/);
});
test('rejects stale SHA, wrong candidate, changed size or target',()=>{
 const v=valid();
 for(const patch of [{observedMainSha:'c'.repeat(40)},{expectedMainSha:'invalid'},
 {objects:{success:true,result:[]}},{objects:{success:true,result:[{key:'other',size:3224706}]}},
 {objects:{success:true,result:[{key:EVIDENCE.candidateKey,size:1}]}},
 {target:{success:true,result:{...v.target.result,num_tables:1}}},
 {target:{success:true,result:{...v.target.result,uuid:EVIDENCE.sourceId}}},
 {target:{success:false,result:v.target.result}}])
 assert.throws(()=>assessIsolatedVersionedPreflight({...v,...patch}),/versioned_preflight_hold_/);
});
test('fixed cloud API URLs use GET only and never read SQL objects',async()=>{
 const v=valid(),replies=[v.lock,v.objects,v.target];let n=0;
 const x=await readIsolatedVersionedPreflight({accountId:EVIDENCE.accountId,token:'test-token',expectedMainSha:sha,observedMainSha:sha,fetchImpl:async(url,opts)=>{
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  assert.equal(opts.headers.Authorization,'Bearer test-token');
  assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+EVIDENCE.accountId+'/'));
  assert.ok(!url.includes('/import')&&!url.includes('/restore')&&!url.includes('/objects/'+EVIDENCE.candidateKey));
  return {ok:true,text:async()=>JSON.stringify(replies[n++])};
 }});
 assert.equal(n,3);assert.equal(x.restoreAuthorized,false);
 await assert.rejects(()=>readIsolatedVersionedPreflight({accountId:'wrong',token:'x',expectedMainSha:sha,observedMainSha:sha}),/authority/);
});
