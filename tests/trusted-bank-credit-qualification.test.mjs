import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {OWNER_BANK_ALLOCATION_SCHEMA} from '../server/payments/owner-bank-allocation-contract.mjs';
import {createD1BankAllocationAdapter} from '../server/payments/d1-bank-allocation-adapter-reference.mjs';
import {qualifyOwnerSettledBankCredit} from '../server/payments/trusted-bank-credit-qualification.mjs';

// Disposable local D1, simulated server-side bank lookup. No bank or payment API.
const invoice={id:'order-a',tenantId:'tenant-a',amountMinor:150000,currency:'BWP'};
const reviewer={authenticated:true,role:'owner',tenantId:'tenant-a',actorId:'owner-a'};
const credit={
  source:'trusted_bank_reconciliation',status:'settled',direction:'credit',
  final:true,bankTransactionId:'bank-txn-a',companyAccountId:'company-bank-key',
  orderReference:'THEBE-ORDER-A',amountMinor:150000,currency:'BWP',
  settledAt:'2026-11-10T10:00:00Z'
};
const verifiedAt='2026-11-10T10:30:00Z';
const params={
  tenantId:invoice.tenantId,invoice,reviewer,
  bankTransactionId:credit.bankTransactionId,
  companyAccountId:credit.companyAccountId,orderReference:credit.orderReference,
  verifiedAt
};

async function fixture(initialCredit=credit){
  const mf=new Miniflare(convertV4MiniflareOptions({
    modules:true,script:"export default {fetch(){return new Response('isolated bank qualification')}}",
    compatibilityDate:'2026-09-03',d1Databases:{DB:'bank-credit-local-staging'}
  }));
  try{
    const db=await mf.getD1Database('DB');
    for(const sql of splitSqliteMigrationStatements(OWNER_BANK_ALLOCATION_SCHEMA))
      await db.prepare(sql).run();
    let calls=0;
    const trustedBankSource={
      async lookupSettledCredit(){
        calls++;
        return initialCredit;
      }
    };
    const allocationAdapter=createD1BankAllocationAdapter(db);
    const qualify=(patch={})=>qualifyOwnerSettledBankCredit({
      ...params,trustedBankSource,allocationAdapter,...patch
    });
    const count=async()=>Number((await db.prepare(
      'SELECT COUNT(*) AS n FROM owner_bank_receipt_allocation'
    ).first()).n);
    return {mf,db,qualify,count,source:trustedBankSource,allocationAdapter,
      get bankCalls(){return calls}};
  }catch(e){await mf.dispose();throw e;}
}

test('independently sourced settled bank credit allocates in local D1 but never activates entitlement',async()=>{
  const f=await fixture();
  try{
    assert.deepEqual(await f.qualify(),{status:'allocated',entitlementActivated:false});
    assert.equal(await f.count(),1);
    assert.equal(f.bankCalls,1);
    const row=await f.db.prepare('SELECT * FROM owner_bank_receipt_allocation').first();
    assert.equal(row.bank_transaction_id,'bank-txn-a');
    assert.equal(row.tenant_id,'tenant-a');
    assert.equal(row.invoice_id,'order-a');
    assert.equal(row.currency,'BWP');
    assert.equal(row.verified_by_actor_id,'owner-a');
    const names=(await f.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_METADATA'"
    ).all()).results.map(x=>x.name);
    assert.deepEqual(names,['owner_bank_receipt_allocation']);
  }finally{await f.mf.dispose();}
});

test('duplicate bank credit and fully allocated invoice cannot be funded twice',async()=>{
  const f=await fixture();
  try{
    assert.equal((await f.qualify()).status,'allocated');
    assert.notEqual((await f.qualify()).status,'allocated');
    // Same global bank ID, different tenant/order must remain blocked.
    const other={id:'order-b',tenantId:'tenant-b',amountMinor:150000,currency:'BWP'};
    const replay=await f.qualify({
      tenantId:'tenant-b',invoice:other,
      reviewer:{...reviewer,tenantId:'tenant-b'},
    });
    assert.notEqual(replay.status,'allocated');
    const nextCredit={...credit,bankTransactionId:'bank-txn-b'};
    const newBank=await f.qualify({
      bankTransactionId:'bank-txn-b',
      trustedBankSource:{lookupSettledCredit:async()=>nextCredit}
    });
    assert.notEqual(newBank.status,'allocated','same tenant/invoice cannot be funded with a second credit');
    assert.equal(await f.count(),1);
  }finally{await f.mf.dispose();}
});

test('concurrent reviewers racing for one credit yield only one allocation',async()=>{
  const f=await fixture();
  try{
    const results=await Promise.all([f.qualify(),f.qualify()]);
    assert.equal(results.filter(x=>x.status==='allocated').length,1);
    assert.equal(await f.count(),1);
  }finally{await f.mf.dispose();}
});

test('untrusted, pending, reversed, debit, non-final and mismatched bank data fail closed',async()=>{
  const patches=[
    {source:'customer_upload'}, {source:'admin_form'},
    {status:'pending'}, {status:'reversed'}, {status:'chargeback'},
    {direction:'debit'}, {final:false}, {companyAccountId:'other-company'},
    {orderReference:'OTHER-ORDER'}, {amountMinor:149999},
    {currency:'USD'}, {settledAt:'2026-11-10T11:00:00Z'},
    {settledAt:'not-a-date'}, {bankTransactionId:'different-id'}
  ];
  const f=await fixture();
  try{
    for(const bad of patches){
      const result=await f.qualify({
        trustedBankSource:{lookupSettledCredit:async()=>({...credit,...bad})}
      });
      assert.notEqual(result.status,'allocated',JSON.stringify(bad));
    }
    assert.equal(await f.count(),0);
  }finally{await f.mf.dispose();}
});

test('bank lookup unavailable, not yet settled, or D1 unavailable cannot allocate',async()=>{
  const f=await fixture();
  try{
    assert.equal((await f.qualify({
      trustedBankSource:{lookupSettledCredit:async()=>null}
    })).status,'awaiting_funds');
    assert.equal((await f.qualify({
      trustedBankSource:{lookupSettledCredit:async()=>{throw Error('bank offline')}}
    })).status,'unavailable');
    assert.equal((await f.qualify({trustedBankSource:null})).status,'unavailable');
    assert.equal((await f.qualify({allocationAdapter:{
      loadConflictingAllocations:async()=>{throw Error('D1 offline')},
      insertUniqueAllocation:async()=>{throw Error('must not execute')}
    }})).status,'unavailable');
    assert.equal(await f.count(),0);
  }finally{await f.mf.dispose();}
});

test('non-owner and cross-tenant reviewer never query bank or write D1',async()=>{
  const f=await fixture();
  try{
    for(const altered of [
      {reviewer:{...reviewer,role:'staff'}},
      {reviewer:{...reviewer,tenantId:'tenant-b'}},
      {reviewer:{...reviewer,authenticated:false}},
      {reviewer:{...reviewer,actorId:''}},
      {tenantId:'tenant-b'},
      {companyAccountId:''},
      {bankTransactionId:' bank-txn-a'},
      {orderReference:' THEBE-ORDER-A'}
    ]){
      const response=await f.qualify(altered);
      assert.equal(response.status,'denied');
    }
    assert.equal(f.bankCalls,0);
    assert.equal(await f.count(),0);
  }finally{await f.mf.dispose();}
});

test('invalid or missing bank allocation conflict lookup fails closed',async()=>{
  const f=await fixture();
  try{
    const base={insertUniqueAllocation:f.allocationAdapter.insertUniqueAllocation};
    for(const loadConflictingAllocations of [undefined,async()=>null,async()=>{throw Error('broken')}]){
      const r=await f.qualify({allocationAdapter:{...base,loadConflictingAllocations}});
      assert.notEqual(r.status,'allocated');
    }
    assert.equal(await f.count(),0);
  }finally{await f.mf.dispose();}
});

test('two genuinely different settled orders may each allocate their distinct bank credits',async()=>{
  const f=await fixture();
  try{
    assert.equal((await f.qualify()).status,'allocated');
    const second={...credit,bankTransactionId:'bank-txn-c',orderReference:'THEBE-ORDER-C'};
    const otherOrder={id:'order-c',tenantId:'tenant-a',amountMinor:150000,currency:'BWP'};
    const response=await f.qualify({
      invoice:otherOrder,bankTransactionId:second.bankTransactionId,
      orderReference:second.orderReference,
      trustedBankSource:{lookupSettledCredit:async()=>second}
    });
    assert.equal(response.status,'allocated');
    assert.equal(await f.count(),2);
  }finally{await f.mf.dispose();}
});
