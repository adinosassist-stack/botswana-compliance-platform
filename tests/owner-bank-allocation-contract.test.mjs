import test from "node:test";
import assert from "node:assert/strict";
import {OWNER_BANK_ALLOCATION_SCHEMA,allocateVerifiedBankReceipt as allocate} from "../server/payments/owner-bank-allocation-contract.mjs";

const invoice={id:"inv-1",tenantId:"tenant-a",amountMinor:150000,currency:"BWP"};
const reviewer={authenticated:true,role:"owner",tenantId:"tenant-a",actorId:"owner-1"};
const decision={decision:"verified",invoiceId:"inv-1",bankTransactionId:"bank-1"};
const make=(adapter,overrides={})=>({adapter,decision,tenantId:"tenant-a",invoice,reviewer,verifiedAt:"2026-10-29T12:00:00Z",...overrides});

test("schema has globally unique bank transaction and tenant invoice constraints",()=>{
 assert.match(OWNER_BANK_ALLOCATION_SCHEMA,/bank_transaction_id TEXT PRIMARY KEY/);
 assert.match(OWNER_BANK_ALLOCATION_SCHEMA,/UNIQUE \(tenant_id, invoice_id\)/);
});
test("trusted allocation inserts exactly one record",async()=>{
 let inserted;
 const adapter={insertUniqueAllocation:async record=>(inserted=record,true)};
 assert.equal((await allocate(make(adapter))).status,"allocated");
 assert.equal(inserted.bankTransactionId,"bank-1");
 assert.equal(inserted.verifiedByActorId,"owner-1");
});
test("simultaneous requests cannot allocate the same receipt with atomic adapter",async()=>{
 const allocated=new Set();
 const adapter={insertUniqueAllocation:async record=>{
   if(allocated.has(record.bankTransactionId)) return false;
   allocated.add(record.bankTransactionId);
   return true;
 }};
 const results=await Promise.all([allocate(make(adapter)),allocate(make(adapter))]);
 assert.deepEqual(results.map(r=>r.status).sort(),["allocated","conflict"]);
});
test("missing adapter or database error fails closed",async()=>{
 assert.equal((await allocate(make(null))).status,"unavailable");
 assert.equal((await allocate(make({insertUniqueAllocation:async()=>{throw Error("offline")}}))).status,"unavailable");
});
test("mismatched invoice, tenant, reviewer and decision are denied",async()=>{
 let calls=0;const adapter={insertUniqueAllocation:async()=>{calls++;return true}};
 for(const patch of [
   {decision:{...decision,invoiceId:"inv-other"}},
   {tenantId:"tenant-b"},
   {reviewer:{...reviewer,role:"staff"}},
   {decision:{...decision,decision:"review_required"}},
   {verifiedAt:"not-a-date"}
 ]) assert.equal((await allocate(make(adapter,patch))).status,"denied");
 assert.equal(calls,0);
});
