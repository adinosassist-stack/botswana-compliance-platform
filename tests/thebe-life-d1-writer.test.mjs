import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareHouseholdEntry,recordHouseholdEntry} from '../server/thebe-life/d1-household-writer.mjs';
const entry={id:'e1',type:'expense',category:'Groceries',amountMinor:12500,currency:'BWP',occurredOn:'2026-11-08'};
const base={householdId:'h1',sessionUserId:'user1',entry};
test('refuses invalid amount, date, currency and transfer without reference',()=>{
  for(const change of [{amountMinor:-1},{amountMinor:1.5},{currency:'USD'},{occurredOn:'2026-02-31'},{type:'transfer_out'}]){
    assert.throws(()=>prepareHouseholdEntry({...base,entry:{...entry,...change}}));
  }
});
test('insert contains atomic server-bound membership gate and no money rail',async()=>{
  let query,params;
  const db={prepare(sql){query=sql;return {bind(...p){params=p;return {async run(){return {meta:{changes:1}};}};}};}};
  const result=await recordHouseholdEntry({db,...base});
  assert.equal(result.created,true);
  assert.match(result.reason,/not_bank_verified/);
  assert.match(query,/WHERE EXISTS/);
  assert.match(query,/status = 'active'/);
  assert.match(query,/role IN \('owner','adult'\)/);
  assert.match(query,/ON CONFLICT\(household_id,id\) DO NOTHING/);
  assert.deepEqual(params,['h1','e1','expense','Groceries',12500,'BWP','2026-11-08',null,'user1']);
});
test('no authorization or duplicate fails closed without claiming success',async()=>{
  const db={prepare(){return {bind(){return {async run(){return {meta:{changes:0}};}};}};}};
  assert.deepEqual(await recordHouseholdEntry({db,...base}),{created:false,reason:'not_authorized_or_duplicate'});
});
test('bad database receipts are not treated as successful writes',async()=>{
  const db={prepare(){return {bind(){return {async run(){return {meta:{changes:2}};}};}};}};
  await assert.rejects(recordHouseholdEntry({db,...base}),/invalid_d1_write_receipt/);
});
