import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {OWNER_BANK_ALLOCATION_SCHEMA,allocateVerifiedBankReceipt} from "../server/payments/owner-bank-allocation-contract.mjs";

const invoice={id:"inv-1",tenantId:"tenant-a",amountMinor:150000,currency:"BWP"};
const reviewer={authenticated:true,role:"owner",tenantId:"tenant-a",actorId:"owner-1"};
const decision={decision:"verified",invoiceId:"inv-1",bankTransactionId:"bank-1"};
const args=(adapter,patch={})=>({adapter,tenantId:"tenant-a",invoice,reviewer,decision,verifiedAt:"2026-10-29T12:00:00Z",...patch});

function openAdapter(){
 const db=new DatabaseSync(":memory:");
 db.exec(OWNER_BANK_ALLOCATION_SCHEMA);
 const statement=db.prepare(`INSERT OR IGNORE INTO owner_bank_receipt_allocation
 (bank_transaction_id,tenant_id,invoice_id,amount_minor,currency,verified_by_actor_id,verified_at)
 VALUES (?,?,?,?,?,?,?)`);
 return {db,adapter:{insertUniqueAllocation:async record=>{
  const result=statement.run(record.bankTransactionId,record.tenantId,record.invoiceId,record.amountMinor,record.currency,record.verifiedByActorId,record.verifiedAt);
  return result.changes===1;
 }}};
}

test("SQLite accepts exactly one allocation for repeated bank transaction",async()=>{
 const {db,adapter}=openAdapter();
 try{
  assert.equal((await allocateVerifiedBankReceipt(args(adapter))).status,"allocated");
  assert.equal((await allocateVerifiedBankReceipt(args(adapter,{invoice:{...invoice,id:"inv-2"},decision:{...decision,invoiceId:"inv-2"}}))).status,"conflict");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM owner_bank_receipt_allocation").get().n,1);
 }finally{db.close();}
});
test("SQLite prevents second bank transaction allocating the same tenant invoice",async()=>{
 const {db,adapter}=openAdapter();
 try{
  assert.equal((await allocateVerifiedBankReceipt(args(adapter))).status,"allocated");
  assert.equal((await allocateVerifiedBankReceipt(args(adapter,{decision:{...decision,bankTransactionId:"bank-2"}}))).status,"conflict");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM owner_bank_receipt_allocation").get().n,1);
 }finally{db.close();}
});
test("SQLite stores verified actor, tenant and amount",async()=>{
 const {db,adapter}=openAdapter();
 try{
  assert.equal((await allocateVerifiedBankReceipt(args(adapter))).status,"allocated");
  const row=db.prepare("SELECT tenant_id,amount_minor,currency,verified_by_actor_id FROM owner_bank_receipt_allocation").get();
  assert.deepEqual({...row},{tenant_id:"tenant-a",amount_minor:150000,currency:"BWP",verified_by_actor_id:"owner-1"});
 }finally{db.close();}
});


test("SQLite rejects cross-tenant bank transaction replay even for distinct invoices",async()=>{
 const {db,adapter}=openAdapter();
 try{
  assert.equal((await allocateVerifiedBankReceipt(args(adapter))).status,"allocated");
  const second=args(adapter,{
   tenantId:"tenant-b",
   invoice:{id:"inv-2",tenantId:"tenant-b",amountMinor:150000,currency:"BWP"},
   reviewer:{...reviewer,tenantId:"tenant-b"},
   decision:{decision:"verified",invoiceId:"inv-2",bankTransactionId:"bank-1"}
  });
  assert.equal((await allocateVerifiedBankReceipt(second)).status,"conflict");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM owner_bank_receipt_allocation").get().n,1);
 }finally{db.close();}
});
test("SQLite allows distinct settled bank credits for colliding invoice IDs across tenants",async()=>{
 const {db,adapter}=openAdapter();
 try{
  assert.equal((await allocateVerifiedBankReceipt(args(adapter))).status,"allocated");
  const second=args(adapter,{
   tenantId:"tenant-b",
   invoice:{...invoice,tenantId:"tenant-b"},
   reviewer:{...reviewer,tenantId:"tenant-b"},
   decision:{...decision,bankTransactionId:"bank-2"}
  });
  assert.equal((await allocateVerifiedBankReceipt(second)).status,"allocated");
  const rows=db.prepare("SELECT bank_transaction_id,tenant_id,invoice_id FROM owner_bank_receipt_allocation ORDER BY tenant_id").all();
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(row=>row.tenant_id),["tenant-a","tenant-b"]);
 }finally{db.close();}
});
test("SQLite remains unchanged when allocation identity is malformed",async()=>{
 const {db,adapter}=openAdapter();
 try{
  for(const bad of [" bank-1","bank-1 ","bank-\u200b1","bank-cafe\u0301",42]){
   assert.equal((await allocateVerifiedBankReceipt(args(adapter,{
    decision:{...decision,bankTransactionId:bad}
   }))).status,"denied");
  }
  for(const bad of ["owner-\u200b1"," owner-1",null]){
   assert.equal((await allocateVerifiedBankReceipt(args(adapter,{
    reviewer:{...reviewer,actorId:bad}
   }))).status,"denied");
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM owner_bank_receipt_allocation").get().n,0);
 }finally{db.close();}
});
test("SQLite rejects nonpositive amounts and retains an empty ledger",async()=>{
 const {db,adapter}=openAdapter();
 try{
  for(const amountMinor of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
   assert.equal((await allocateVerifiedBankReceipt(args(adapter,{
    invoice:{...invoice,amountMinor}
   }))).status,"denied");
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM owner_bank_receipt_allocation").get().n,0);
 }finally{db.close();}
});
