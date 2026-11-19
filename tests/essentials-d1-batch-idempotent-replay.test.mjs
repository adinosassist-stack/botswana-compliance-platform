import test from "node:test";
import assert from "node:assert/strict";
import {insertOrReplayEssentialsDraftBatch} from "../server/essentials-d1-batch-idempotent-replay.mjs";

const principal={userId:"owner-1",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
const draft={tenantId:"tenant-a",customerId:"customer-a",status:"draft",totalMinor:10000,
 invoiceReference:"ED_RANDOM_1"};
const record={id:"draft-new",tenantId:"tenant-a",customerId:"customer-a",
 sourceQuotationId:"quote-1",idempotencyKey:"idem-1",invoiceNumber:"ED_RANDOM_1",
 createdByUserId:"owner-1",draft};
const stored={id:"draft-original",tenant_id:"tenant-a",customer_id:"customer-a",
 source_quotation_id:"quote-1",invoice_number:"ED_ORIGINAL",status:"draft",
 created_by_user_id:"owner-1",draft_payload_json:JSON.stringify({...draft,invoiceReference:"ED_ORIGINAL"})};
function dbFor({existing=null,insertError=null}={}){
 let reads=0,batches=0;
 const db={prepare:sql=>({bind:(...args)=>({
  first:async()=>{reads++;return typeof existing==="function"?existing(reads):existing},
  sql,args
 })}),batch:async statements=>{
  batches++;
  if(insertError)throw insertError;
  const [id,tenant,customer,source,key,invoice,payload,user]=statements[0].args;
  return [{success:true,results:[]},{success:true,results:[{
   id,tenant_id:tenant,customer_id:customer,source_quotation_id:source,
   idempotency_key:key,invoice_number:invoice,status:"draft",created_by_user_id:user
  }]}];
 }};
 return {db,stats:()=>({reads,batches})};
}
test("new authorized draft is inserted once via atomic batch",async()=>{
 const x=dbFor();const r=await insertOrReplayEssentialsDraftBatch({db:x.db,principal,record});
 assert.equal(r.replayed,false);assert.equal(r.invoice.id,"draft-new");
 assert.deepEqual(x.stats(),{reads:1,batches:1});
});
test("exact same-key replay reuses original invoice reference and does not write",async()=>{
 const x=dbFor({existing:stored});
 const r=await insertOrReplayEssentialsDraftBatch({db:x.db,principal,record});
 assert.equal(r.replayed,true);
 assert.equal(r.invoice.invoiceReference,"ED_ORIGINAL");
 assert.deepEqual(x.stats(),{reads:1,batches:0});
});
test("competing same-key insert can recover only the specific unique-key collision",async()=>{
 const x=dbFor({existing:n=>n===1?null:stored,
  insertError:Error("UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.idempotency_key: SQLITE_CONSTRAINT")});
 const r=await insertOrReplayEssentialsDraftBatch({db:x.db,principal,record});
 assert.equal(r.replayed,true);assert.deepEqual(x.stats(),{reads:2,batches:1});
});
test("same key with changed quote, customer, actor or draft amount is denied",async()=>{
 for(const other of [
  {...stored,source_quotation_id:"quote-2"},
  {...stored,customer_id:"customer-b"},
  {...stored,created_by_user_id:"owner-2"},
  {...stored,draft_payload_json:JSON.stringify({...draft,totalMinor:20000})},
  {...stored,status:"issued"}
 ]){
  const x=dbFor({existing:other});
  await assert.rejects(insertOrReplayEssentialsDraftBatch({db:x.db,principal,record}),/idempotency_conflict/);
  assert.equal(x.stats().batches,0);
 }
});
test("cross-tenant or missing authorization is denied before DB access",async()=>{
 for(const p of [{...principal,tenantId:"tenant-b"},{...principal,permissions:[]}]){
  const x=dbFor();
  await assert.rejects(insertOrReplayEssentialsDraftBatch({db:x.db,principal:p,record}));
  assert.deepEqual(x.stats(),{reads:0,batches:0});
 }
});
test("does not mask invoice-reference/source or network failures",async()=>{
 for(const msg of [
  "UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.invoice_number",
  "UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.source_quotation_id",
  "database unavailable"
 ]){
  const x=dbFor({insertError:Error(msg)});
  await assert.rejects(insertOrReplayEssentialsDraftBatch({db:x.db,principal,record}),e=>e.message===msg);
  assert.deepEqual(x.stats(),{reads:1,batches:1});
 }
});
test("race conflict with no matching committed record retains the original error",async()=>{
 const msg="UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.idempotency_key";
 const x=dbFor({insertError:Error(msg)});
 await assert.rejects(insertOrReplayEssentialsDraftBatch({db:x.db,principal,record}),e=>e.message===msg);
 assert.deepEqual(x.stats(),{reads:2,batches:1});
});
