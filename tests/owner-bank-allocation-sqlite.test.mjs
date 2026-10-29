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
  assert.deepEqual(row,{tenant_id:"tenant-a",amount_minor:150000,currency:"BWP",verified_by_actor_id:"owner-1"});
 }finally{db.close();}
});
