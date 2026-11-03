import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyPopCatalog,verifyPinnedSource,inspectProduction} from '../scripts/inspect-pop-070-071-production-readonly.mjs';
const prod='ddd23cab31928a4bb3d4998df9b26d1d';
const sha='a'.repeat(40);
const base=['tenants','payment_orders','manual_payment_submissions'].map(name=>({name,type:'table'}));
const pop=['payment_pop_documents','payment_pop_upload_requests','payment_pop_documents_order_idx','payment_pop_documents_scan_idx','payment_pop_upload_requests_tenant_idx'].map((name,i)=>({name,type:i<2?'table':'index'}));
test('checked migration SQL matches immutable pinned hashes',()=>{assert.equal(verifyPinnedSource().length,2)});
test('absent POP schema permits review but never authorizes writes',()=>{
 const r=classifyPopCatalog(base);
 assert.equal(r.state,'ready_for_independent_migration_review');
 assert.equal(r.productionWriteAuthorized,false);
 assert.equal(r.missingPopObjects.length,5);
});
test('partial or malformed POP schema fails closed',()=>{
 assert.equal(classifyPopCatalog([...base,pop[0]]).state,'hold_partial_state');
 assert.equal(classifyPopCatalog([...base,{name:pop[0].name,type:'index'}]).state,'hold_incompatible');
 assert.equal(classifyPopCatalog(pop).state,'hold_incompatible');
 assert.throws(()=>classifyPopCatalog([...base,base[0]]),/duplicate_catalog/);
});
test('fully populated POP schema demands provenance review; never replays 071',()=>{
 const r=classifyPopCatalog([...base,...pop]);
 assert.equal(r.state,'already_present_requires_provenance_review');
 assert.equal(r.productionWriteAuthorized,false);
});
test('read-only D1 calls are fixed and no writes, grants or activation are performed',async()=>{
 const requests=[];
 const request=async(url,opts)=>{
  requests.push({url,opts});
  return {ok:true,json:async()=>({success:true,result:opts.method==='GET'?{uuid:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',name:'bw-compliance-os'}:[{success:true,results:base,meta:{rows_written:0}}]})};
 };
 const r=await inspectProduction({accountId:prod,token:'test-token',commitSha:sha,expectedMainSha:sha,request});
 assert.equal(r.state,'ready_for_independent_migration_review');
 assert.equal(r.productionWriteAuthorized,false);
 assert.equal(r.migrationApplied,false);
 assert.equal(r.popActivated,false);
 assert.deepEqual(requests.map(x=>x.opts.method),['GET','POST']);
 const query=JSON.parse(requests[1].opts.body);
 assert.match(query.sql,/sqlite_master/);
 assert.doesNotMatch(query.sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
 assert.deepEqual(query.params,[]);
});
test('fail closed on wrong authority, wrong target and nonzero database writes',async()=>{
 const thrower=()=>inspectProduction({accountId:'wrong',token:'x',commitSha:sha,expectedMainSha:sha,request:async()=>{throw Error('should not call')}});
 await assert.rejects(thrower,/account_mismatch/);
 await assert.rejects(()=>inspectProduction({accountId:prod,token:'x',commitSha:sha,expectedMainSha:'b'.repeat(40),request:async()=>{throw Error('should not call')}}),/head_mismatch/);
 const respond=(identity,rowsWritten=0)=>async(_,opts)=>({ok:true,json:async()=>({success:true,result:opts.method==='GET'?identity:[{success:true,results:base,meta:{rows_written:rowsWritten}}]})});
 await assert.rejects(()=>inspectProduction({accountId:prod,token:'x',commitSha:sha,expectedMainSha:sha,request:respond({uuid:'wrong',name:'bw-compliance-os'})}),/target_mismatch/);
 await assert.rejects(()=>inspectProduction({accountId:prod,token:'x',commitSha:sha,expectedMainSha:sha,request:respond({uuid:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',name:'bw-compliance-os'},1)}),/query_not_readonly/);
});
