import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyPhase} from '../scripts/qualify-pop-production-phase-offline.mjs';
const base={mainSha:'a'.repeat(40),expectedSha:'a'.repeat(40),accountId:'ddd23cab31928a4bb3d4998df9b26d1d',databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
 tableNames:['tenants','payment_orders','manual_payment_submissions'],indexNames:[],documentColumnNames:[],requestColumnNames:[]};
const original=['id','tenant_id','payment_order_id','submission_id','source','object_key','display_name','content_type','bytes','scan_status','received_by_user_id','uploaded_at','deleted_at'];
const p070={...base,phase:'070'};
const p071={...base,phase:'071',tableNames:[...base.tableNames,'payment_pop_documents'],indexNames:['payment_pop_documents_order_idx','payment_pop_documents_scan_idx'],documentColumnNames:original};
test('070 clean input returns review-only, never production authority',()=>{
 const x=qualifyPhase(p070);assert.equal(x.productionWriteAuthorized,false);assert.equal(x.migrationApplied,false);assert.equal(x.phase,'070');
});
test('071 complete 070 input is review-only, not approval',()=>{
 const x=qualifyPhase(p071);assert.equal(x.productionWriteAuthorized,false);assert.equal(x.popEnabled,false);
});
test('070 refuses already or partially installed objects',()=>{
 for(const input of [{tableNames:[...base.tableNames,'payment_pop_documents']},{indexNames:['payment_pop_documents_scan_idx']},{tableNames:[...base.tableNames,'payment_pop_upload_requests']}])
 assert.throws(()=>qualifyPhase({...p070,...input}),/partial_or_replayed/);
});
test('071 refuses partial or duplicate schema',()=>{
 for(const input of [{documentColumnNames:[...original,'content_sha256']},{tableNames:[...p071.tableNames,'payment_pop_upload_requests']},{indexNames:[...p071.indexNames,'payment_pop_upload_requests_tenant_idx']},{documentColumnNames:original.slice(1)}])
 assert.throws(()=>qualifyPhase({...p071,...input}),/partial_or_replayed/);
});
test('source, target and prerequisite drift are rejected',()=>{
 assert.throws(()=>qualifyPhase({...p070,expectedSha:'b'.repeat(40)}),/stale_main/);
 assert.throws(()=>qualifyPhase({...p070,databaseId:'812f9021-890b-41e6-8fa1-6001f90a9b53'}),/target/);
 assert.throws(()=>qualifyPhase({...p070,tableNames:base.tableNames.slice(1)}),/prerequisite/);
 assert.throws(()=>qualifyPhase({...p070,tableNames:[...base.tableNames,base.tableNames[0]]}),/inventory/);
});
test('modified SQL bytes fail closed',()=>{
 assert.throws(()=>qualifyPhase(p070,()=>Buffer.from('changed SQL')),/sql_drift/);
 assert.throws(()=>qualifyPhase(p071,()=>Buffer.from('changed SQL')),/sql_drift/);
});


test('070 and 071 reject unexpected POP-prefixed tables and indexes before any write',()=>{
 for(const name of ['payment_pop_shadow','payment_pop_documents_old','payment_pop_repair_tmp']){
  assert.throws(()=>qualifyPhase({...p070,tableNames:[...base.tableNames,name]}),/070_partial_or_replayed/);
  assert.throws(()=>qualifyPhase({...p070,indexNames:[name]}),/070_partial_or_replayed/);
  assert.throws(()=>qualifyPhase({...p071,tableNames:[...p071.tableNames,name]}),/071_partial_or_replayed/);
  assert.throws(()=>qualifyPhase({...p071,indexNames:[...p071.indexNames,name]}),/071_partial_or_replayed/);
 }
 assert.equal(qualifyPhase(p070).productionWriteAuthorized,false);
 assert.equal(qualifyPhase(p071).productionWriteAuthorized,false);
});
