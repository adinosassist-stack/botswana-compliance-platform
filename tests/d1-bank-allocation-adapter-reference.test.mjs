import test from "node:test";
import assert from "node:assert/strict";
import {createD1BankAllocationAdapter} from "../server/payments/d1-bank-allocation-adapter-reference.mjs";
const record={bankTransactionId:"bank-1",tenantId:"tenant-a",invoiceId:"inv-1",amountMinor:150000,currency:"BWP",verifiedByActorId:"owner-1",verifiedAt:"2026-10-29T12:00:00Z"};
function fake(changes,{success=true}={}){
 const calls=[];
 const db={prepare(sql){calls.push({sql});return {bind(...args){calls.push({args});return {async run(){return {success,meta:{changes}};}};}}}};
 return {db,calls};
}
test("D1 adapter binds all values and accepts exactly one inserted row",async()=>{
 const {db,calls}=fake(1);
 assert.equal(await createD1BankAllocationAdapter(db).insertUniqueAllocation(record),true);
 assert.match(calls[0].sql,/INSERT OR IGNORE/);
 assert.deepEqual(calls[1].args,["bank-1","tenant-a","inv-1",150000,"BWP","owner-1","2026-10-29T12:00:00Z"]);
});
test("D1 uniqueness conflict returns false",async()=>{
 assert.equal(await createD1BankAllocationAdapter(fake(0).db).insertUniqueAllocation(record),false);
});
test("unconfirmed D1 result fails closed",async()=>{
 await assert.rejects(()=>createD1BankAllocationAdapter(fake(undefined).db).insertUniqueAllocation(record));
 await assert.rejects(()=>createD1BankAllocationAdapter(fake(1,{success:false}).db).insertUniqueAllocation(record));
});
test("missing D1 binding and invalid allocation reject",async()=>{
 assert.throws(()=>createD1BankAllocationAdapter(null));
 await assert.rejects(()=>createD1BankAllocationAdapter(fake(1).db).insertUniqueAllocation({...record,amountMinor:0}));
});

test("ambiguous multi-row D1 changes fail closed",async()=>{
 await assert.rejects(()=>createD1BankAllocationAdapter(fake(2).db).insertUniqueAllocation(record));
 await assert.rejects(()=>createD1BankAllocationAdapter(fake(-1).db).insertUniqueAllocation(record));
});
test("D1 binding and execution exceptions are not interpreted as allocation success",async()=>{
 const db={prepare(){return {bind(){return {run:async()=>{throw Error("D1 unavailable");}}}}}};
 await assert.rejects(()=>createD1BankAllocationAdapter(db).insertUniqueAllocation(record));
});
