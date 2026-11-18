import test from "node:test";
import assert from "node:assert/strict";
import {insertEssentialsDraftD1,findEssentialsDraftByKeyD1} from "../server/essentials-d1-draft-repository.mjs";
const draft={status:"draft",tenantId:"tenant-a",customerId:"customer-a",invoiceReference:"INV-1",totalMinor:10000};
const record={id:"draft-1",tenantId:"tenant-a",customerId:"customer-a",sourceQuotationId:"quote-1",idempotencyKey:"request-1",invoiceNumber:"INV-1",createdByUserId:"owner-1",draft};
test("inserts draft with bound parameters only",async()=>{
 let sql,args;
 const db={prepare:q=>{sql=q;return {bind:(...v)=>{args=v;return {run:async()=>({success:true})};}};}};
 const result=await insertEssentialsDraftD1({db,record});
 assert.equal(result.inserted,true);assert.match(sql,/VALUES \(\?,\?,\?,\?,\?,\?,\?,'draft',\?\)/);assert.equal(args[1],"tenant-a");
});
test("rejects tenant-mismatched draft before database access",async()=>{
 await assert.rejects(insertEssentialsDraftD1({db:{prepare:()=>{throw Error("unexpected");}},record:{...record,draft:{...draft,tenantId:"tenant-b"}}}),/invalid_draft/);
});
test("looks up idempotency key with tenant-scoped predicate",async()=>{
 let sql,args;const db={prepare:q=>{sql=q;return {bind:(...v)=>{args=v;return {first:async()=>null};}};}};
 assert.equal(await findEssentialsDraftByKeyD1({db,tenantId:"tenant-a",idempotencyKey:"request-1"}),null);
 assert.match(sql,/WHERE tenant_id=\? AND idempotency_key=\?/);assert.deepEqual(args,["tenant-a","request-1"]);
});
