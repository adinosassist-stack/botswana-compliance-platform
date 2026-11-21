import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsInvoiceDraft} from "../server/essentials-invoice-transaction.mjs";
const principal={userId:"owner-1",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
const quotation={id:"quote-1",companyId:"tenant-a",customerId:"customer-1",reference:"Q-1",status:"accepted",items:[{description:"Stone",quantity:1,unitMinor:10000,lineMinor:10000}],discountMinor:0,totalMinor:10000};
const args={principal,tenantId:"tenant-a",quotationId:"quote-1",idempotencyKey:"req-1",createdAt:"2026-11-18"};
test("uses transactional tenant-scoped quotation and inserts a draft",async()=>{
 const calls=[];
 const repository={transaction:async fn=>fn({
  getDraftByIdempotencyKey:async()=>null,
  getQuotationForTenant:async ({tenantId})=>{calls.push(tenantId);return quotation;},
  reserveInvoiceReference:async()=> "INV-1",
  insertDraftInvoice:async ({tenantId,sourceQuotationId,draft})=>({tenantId,sourceQuotationId,customerId:"customer-1",createdByUserId:"owner-1",status:"draft",totalMinor:draft.totalMinor})
 })};
 const x=await createEssentialsInvoiceDraft({...args,repository});
 assert.equal(x.invoice.totalMinor,10000);assert.equal(x.replayed,false);assert.deepEqual(calls,["tenant-a"]);
});
test("replays matching idempotency key without creating another invoice",async()=>{
 const existing={tenantId:"tenant-a",sourceQuotationId:"quote-1",customerId:"customer-1",createdByUserId:"owner-1",status:"draft"};
 const repository={transaction:async fn=>fn({getDraftByIdempotencyKey:async()=>existing,getQuotationForTenant:async()=>quotation,reserveInvoiceReference:async()=>{throw Error("unexpected_reserve");},insertDraftInvoice:async()=>{throw Error("unexpected_insert");}})};
 assert.equal((await createEssentialsInvoiceDraft({...args,repository})).replayed,true);
});
test("rejects cross-tenant access before opening a transaction",async()=>{
 await assert.rejects(createEssentialsInvoiceDraft({...args,tenantId:"tenant-b",repository:{transaction:async()=>{throw Error("should_not_run");}}}),/permission_denied/);
});
test("rejects unaccepted quotations and mismatched idempotency reuse",async()=>{
 const repo=(existing,quote)=>({transaction:async fn=>fn({getDraftByIdempotencyKey:async()=>existing,getQuotationForTenant:async()=>quote,reserveInvoiceReference:async()=> "INV-1",insertDraftInvoice:async()=>({})})});
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository:repo(null,{...quotation,status:"draft"})}),/quotation_not_accepted/);
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository:repo({sourceQuotationId:"other"},quotation)}),/idempotency_conflict/);
});

test("rejects a replay record from another tenant even with matching quote ID",async()=>{
 const repository={transaction:async fn=>fn({
  getDraftByIdempotencyKey:async()=>({tenantId:"tenant-b",sourceQuotationId:"quote-1",status:"draft"}),
  getQuotationForTenant:async()=>quotation,
  reserveInvoiceReference:async()=>{throw Error("unexpected_reserve");},
  insertDraftInvoice:async()=>{throw Error("unexpected_insert");}
 })};
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository}),/idempotency_conflict/);
});
test("rejects replay of a non-draft invoice",async()=>{
 const repository={transaction:async fn=>fn({
  getDraftByIdempotencyKey:async()=>({tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"issued"}),
  getQuotationForTenant:async()=>quotation,
  reserveInvoiceReference:async()=>{throw Error("unexpected_reserve");},
  insertDraftInvoice:async()=>{throw Error("unexpected_insert");}
 })};
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository}),/idempotency_conflict/);
});

test("idempotent retries fail closed if the current quotation is missing, revoked or foreign",async()=>{
 const existing={id:"draft-1",tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"draft"};
 for(const [current,error] of [
  [null,/quotation_not_found/],
  [{...quotation,status:"revoked"},/quotation_not_accepted/],
  [{...quotation,status:"draft"},/quotation_not_accepted/],
  [{...quotation,companyId:"tenant-b"},/tenant_access_denied/],
  [{...quotation,id:"quote-other"},/tenant_access_denied/]
 ]){
  let replayReads=0;
  const repository={transaction:async fn=>fn({
   getQuotationForTenant:async()=>current,
   getDraftByIdempotencyKey:async()=>{replayReads++;return existing},
   reserveInvoiceReference:async()=>{throw Error("unexpected_reserve")},
   insertDraftInvoice:async()=>{throw Error("unexpected_insert")}
  })};
  await assert.rejects(createEssentialsInvoiceDraft({...args,repository}),error);
  assert.equal(replayReads,0,"ineligible quotation must be denied before replay lookup");
 }
});
test("accepted current quote permits replay without allocating a new invoice reference",async()=>{
 const existing={id:"draft-1",tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"draft"};
 let reads=0;
 const repository={transaction:async fn=>fn({
  getQuotationForTenant:async()=>{reads++;return quotation},
  getDraftByIdempotencyKey:async()=>existing,
  reserveInvoiceReference:async()=>{throw Error("unexpected_reserve")},
  insertDraftInvoice:async()=>{throw Error("unexpected_insert")}
 })};
 const result=await createEssentialsInvoiceDraft({...args,repository});
 assert.equal(result.replayed,true);
 assert.equal(result.invoice,existing);
 assert.equal(reads,1);
});

test("idempotent reuse by another user in the same tenant fails closed",async()=>{
 const existing={tenantId:"tenant-a",sourceQuotationId:"quote-1",customerId:"customer-1",createdByUserId:"other-user",status:"draft"};
 const repository={transaction:async fn=>fn({
  getQuotationForTenant:async()=>quotation,
  getDraftByIdempotencyKey:async()=>existing,
  reserveInvoiceReference:async()=>{throw Error("unexpected_reserve")},
  insertDraftInvoice:async()=>{throw Error("unexpected_insert")}
 })};
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository}),/idempotency_conflict/);
});
test("idempotency reuse for a different customer and mismatched inserted identity fails closed",async()=>{
 const transaction=tx=>({transaction:async fn=>fn({
  getQuotationForTenant:async()=>quotation,
  getDraftByIdempotencyKey:async()=>tx.existing??null,
  reserveInvoiceReference:async()=> "INV-1",
  insertDraftInvoice:async()=>tx.inserted
 })});
 const existing={tenantId:"tenant-a",sourceQuotationId:"quote-1",customerId:"customer-other",
  createdByUserId:"owner-1",status:"draft"};
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository:transaction({existing})}),/idempotency_conflict/);
 for(const inserted of [
  {tenantId:"tenant-a",sourceQuotationId:"quote-1",customerId:"other-customer",createdByUserId:"owner-1",status:"draft"},
  {tenantId:"tenant-a",sourceQuotationId:"quote-1",customerId:"customer-1",createdByUserId:"other-user",status:"draft"}
 ]){
  await assert.rejects(createEssentialsInvoiceDraft({...args,repository:transaction({inserted})}),/invalid_insert_result/);
 }
});
