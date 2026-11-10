import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {OWNER_BANK_ALLOCATION_SCHEMA,allocateVerifiedBankReceipt}
 from '../server/payments/owner-bank-allocation-contract.mjs';
import {createD1BankAllocationAdapter}
 from '../server/payments/d1-bank-allocation-adapter-reference.mjs';
import {evaluateOwnerPaymentEvidence,PAYMENT_DECISIONS}
 from '../server/payments/owner-payment-evidence-policy.mjs';

// Disposable Miniflare D1: NO live bank APIs, production DB, Worker deployment,
// feature activation, or customer money movement.
const record={
 bankTransactionId:'settlement-a',tenantId:'tenant-a',invoiceId:'invoice-a',
 amountMinor:150000,currency:'BWP',verifiedByActorId:'owner-a',
 verifiedAt:'2026-11-10T09:00:00Z'
};
const invoice={id:record.invoiceId,tenantId:record.tenantId,
 amountMinor:record.amountMinor,currency:record.currency};
const reviewer={authenticated:true,role:'owner',tenantId:record.tenantId,actorId:'owner-a'};
const evidence={
 invoiceId:invoice.id,tenantId:invoice.tenantId,source:'trusted_bank_reconciliation',
 status:'settled',bankTransactionId:record.bankTransactionId,
 amountMinor:invoice.amountMinor,currency:'BWP'
};

async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,script:"export default {fetch(){return new Response('isolated bank D1')}}",
  compatibilityDate:'2026-09-03',d1Databases:{DB:'bank-allocation-isolated-evidence'}
 }));
 try{
  const db=await mf.getD1Database('DB');
  for(const sql of splitSqliteMigrationStatements(OWNER_BANK_ALLOCATION_SCHEMA))
   await db.prepare(sql).run();
  return {db,mf,adapter:createD1BankAllocationAdapter(db)};
 }catch(e){await mf.dispose();throw e;}
}
const count=async db=>(await db.prepare(
 'SELECT COUNT(*) AS n FROM owner_bank_receipt_allocation').first()).n;
const allocate=(adapter,decision={decision:'verified',
 invoiceId:invoice.id,bankTransactionId:record.bankTransactionId},
 options={})=>allocateVerifiedBankReceipt({
 adapter,decision,tenantId:invoice.tenantId,invoice,reviewer,
 verifiedAt:record.verifiedAt,...options
});

test('real local D1 performs exactly one atomic allocation for concurrent same bank receipt',async()=>{
 const f=await fixture();
 try{
  const result=await Promise.all([
   f.adapter.insertUniqueAllocation(record),
   f.adapter.insertUniqueAllocation(record)
  ]);
  assert.deepEqual(result.sort(),[false,true]);
  assert.equal(await count(f.db),1);
  const saved=await f.db.prepare('SELECT * FROM owner_bank_receipt_allocation').first();
  assert.equal(saved.bank_transaction_id,record.bankTransactionId);
  assert.equal(saved.amount_minor,record.amountMinor);
  assert.equal(saved.currency,'BWP');
  assert.equal(saved.verified_by_actor_id,'owner-a');
 }finally{await f.mf.dispose();}
});

test('global bank transaction and same-tenant full-invoice uniqueness are enforced by D1',async()=>{
 const f=await fixture();
 try{
  assert.equal(await f.adapter.insertUniqueAllocation(record),true);
  assert.equal(await f.adapter.insertUniqueAllocation({
   ...record,tenantId:'tenant-b',invoiceId:'invoice-b'
  }),false,'one bank transaction cannot fund another tenant');
  assert.equal(await f.adapter.insertUniqueAllocation({
   ...record,bankTransactionId:'new-bank-transaction'
  }),false,'fresh transaction cannot re-fund the same tenant invoice');
  assert.equal(await f.adapter.insertUniqueAllocation({
   ...record,bankTransactionId:'tenant-b-transaction',tenantId:'tenant-b',
   invoiceId:'invoice-a'
  }),true,'same invoice identifier in another tenant is independent');
  assert.equal(await count(f.db),2);
 }finally{await f.mf.dispose();}
});

test('real D1 allocation contract requires owner, invoice, exact amount and valid decision',async()=>{
 const f=await fixture();
 try{
  assert.deepEqual(await allocate(f.adapter),{status:'allocated'});
  assert.deepEqual(await allocate(f.adapter),{status:'conflict'});
  for(const patch of [
   {reviewer:{...reviewer,role:'staff'}},
   {reviewer:{...reviewer,tenantId:'tenant-b'}},
   {tenantId:'tenant-b'},
   {invoice:{...invoice,amountMinor:0}},
   {invoice:{...invoice,currency:'usd'}},
   {decision:{decision:'review_required',invoiceId:invoice.id,
    bankTransactionId:'fresh-credit'}}
  ]){
   const r=await allocate(f.adapter,undefined,patch);
   assert.equal(r.status,'denied');
  }
  assert.equal(await count(f.db),1);
 }finally{await f.mf.dispose();}
});

test('reconciliation evidence must be settled, independent and unused before D1 allocation',async()=>{
 const f=await fixture();
 try{
  const denyCases=[
   {...evidence,source:'customer_upload'},
   {...evidence,source:'admin_form'},
   {...evidence,status:'pending'},
   {...evidence,status:'reversed'},
   {...evidence,status:'chargeback'},
   {...evidence,amountMinor:149999},
   {...evidence,currency:'USD'},
   {...evidence,tenantId:'tenant-b'}
  ];
  for(const bankEvidence of denyCases){
   const result=evaluateOwnerPaymentEvidence({
    tenantId:invoice.tenantId,invoice,reviewer,
    bankEvidence,priorBankAllocations:[]
   });
   assert.notEqual(result.decision,PAYMENT_DECISIONS.VERIFIED);
  }
  assert.equal(await count(f.db),0,'unverified evidence never writes');
  const settled=evaluateOwnerPaymentEvidence({
   tenantId:invoice.tenantId,invoice,reviewer,
   bankEvidence:evidence,priorBankAllocations:[]
  });
  assert.equal(settled.decision,PAYMENT_DECISIONS.VERIFIED);
  assert.deepEqual(await allocate(f.adapter,settled),{status:'allocated'});
  const history=await f.db.prepare(
   'SELECT bank_transaction_id AS bankTransactionId,tenant_id AS tenantId,invoice_id AS invoiceId FROM owner_bank_receipt_allocation'
  ).all();
  const replay=evaluateOwnerPaymentEvidence({
   tenantId:invoice.tenantId,invoice,reviewer,
   bankEvidence:evidence,priorBankAllocations:history.results
  });
  assert.notEqual(replay.decision,PAYMENT_DECISIONS.VERIFIED);
  assert.equal(await count(f.db),1);
 }finally{await f.mf.dispose();}
});

test('invalid input cannot insert and reference allocation cannot grant entitlements',async()=>{
 const f=await fixture();
 try{
  for(const patch of [
   {bankTransactionId:' bank-a'},
   {bankTransactionId:'bank-\u200b1'},
   {currency:'bwp'},{verifiedAt:'2026-02-30T10:00:00Z'},
   {amountMinor:0},{amountMinor:0.5},{amountMinor:Number.MAX_SAFE_INTEGER+1},
   {verifiedByActorId:'owner-\u200b1'}
  ]){
   await assert.rejects(
    f.adapter.insertUniqueAllocation({...record,...patch}),/invalid allocation record/
   );
  }
  assert.equal(await count(f.db),0);
  assert.equal(await f.adapter.insertUniqueAllocation(record),true);
  const objects=await f.db.prepare(
   "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();
  assert.deepEqual(objects.results.map(x=>x.name),
   ['owner_bank_receipt_allocation'],
   'reference-only schema has no customer entitlement or subscription activation table');
 }finally{await f.mf.dispose();}
});
