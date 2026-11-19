import test from "node:test";
import assert from "node:assert/strict";
import {insertAuthorizedEssentialsDraftBatch} from "../server/essentials-d1-atomic-batch.mjs";

const principal={userId:"owner-1",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
const record={id:"draft-1",tenantId:"tenant-a",customerId:"customer-a",sourceQuotationId:"quote-1",
 idempotencyKey:"idem-1",invoiceNumber:"INV-1",createdByUserId:"owner-1",
 draft:{status:"draft",tenantId:"tenant-a",customerId:"customer-a",invoiceReference:"INV-1"}};
const row={id:"draft-1",tenant_id:"tenant-a",customer_id:"customer-a",source_quotation_id:"quote-1",
 idempotency_key:"idem-1",invoice_number:"INV-1",status:"draft",created_by_user_id:"owner-1"};
function mock({batchFail=false,readRow=row}={}){
 const calls={prepare:[],batch:0};
 const db={prepare:sql=>{calls.prepare.push(sql);return {bind:(...args)=>({sql,args})}},
  batch:async statements=>{calls.batch++;assert.equal(statements.length,2);
   if(batchFail)throw Error("SQLITE_CONSTRAINT_UNIQUE");
   return [{success:true,results:[]},{success:true,results:readRow?[readRow]:[]}];
 }};
 return {db,calls};
}
test("uses a single D1 batch of bound INSERT and tenant-scoped readback",async()=>{
 const {db,calls}=mock();
 const got=await insertAuthorizedEssentialsDraftBatch({db,principal,record});
 assert.equal(got.id,"draft-1");assert.equal(got.status,"draft");
 assert.equal(calls.batch,1);assert.match(calls.prepare[1],/WHERE id=\? AND tenant_id=\?/);
});
test("denies wrong tenant or actor and untrusted permission before any D1 call",async()=>{
 for(const [p,r] of [
  [{...principal,tenantId:"tenant-b"},record],
  [{...principal,userId:"attacker"},record],
  [{...principal,permissions:[]},record],
  [principal,{...record,draft:{...record.draft,tenantId:"tenant-b"}}],
 ]){const {db,calls}=mock();await assert.rejects(insertAuthorizedEssentialsDraftBatch({db,principal:p,record:r}));assert.equal(calls.batch,0);assert.equal(calls.prepare.length,0)}
});
test("does not swallow uniqueness constraint errors or retry without host authorization",async()=>{
 const {db,calls}=mock({batchFail:true});
 await assert.rejects(insertAuthorizedEssentialsDraftBatch({db,principal,record}),/SQLITE_CONSTRAINT_UNIQUE/);
 assert.equal(calls.batch,1);
});
test("fails closed when readback absent or inconsistent",async()=>{
 for(const r of [null,{...row,tenant_id:"tenant-b"},{...row,status:"issued"}]){
  const {db}=mock({readRow:r});
  await assert.rejects(insertAuthorizedEssentialsDraftBatch({db,principal,record}),/atomic_batch/);
 }
});
test("requires D1 batch and never substitutes separate run() calls",async()=>{
 await assert.rejects(insertAuthorizedEssentialsDraftBatch({db:{prepare:()=>{}},principal,record}),/d1_batch_required/);
});
