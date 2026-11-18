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
  insertDraftInvoice:async ({tenantId,sourceQuotationId,draft})=>({tenantId,sourceQuotationId,status:"draft",totalMinor:draft.totalMinor})
 })};
 const x=await createEssentialsInvoiceDraft({...args,repository});
 assert.equal(x.invoice.totalMinor,10000);assert.equal(x.replayed,false);assert.deepEqual(calls,["tenant-a"]);
});
test("replays matching idempotency key without creating another invoice",async()=>{
 const existing={tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"draft"};
 const repository={transaction:async fn=>fn({getDraftByIdempotencyKey:async()=>existing,getQuotationForTenant:async()=>{throw Error("unexpected_read");},reserveInvoiceReference:async()=>{throw Error("unexpected_reserve");},insertDraftInvoice:async()=>{throw Error("unexpected_insert");}})};
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
  getQuotationForTenant:async()=>{throw Error("unexpected_read");},
  reserveInvoiceReference:async()=>{throw Error("unexpected_reserve");},
  insertDraftInvoice:async()=>{throw Error("unexpected_insert");}
 })};
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository}),/idempotency_conflict/);
});
test("rejects replay of a non-draft invoice",async()=>{
 const repository={transaction:async fn=>fn({
  getDraftByIdempotencyKey:async()=>({tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"issued"}),
  getQuotationForTenant:async()=>{throw Error("unexpected_read");},
  reserveInvoiceReference:async()=>{throw Error("unexpected_reserve");},
  insertDraftInvoice:async()=>{throw Error("unexpected_insert");}
 })};
 await assert.rejects(createEssentialsInvoiceDraft({...args,repository}),/idempotency_conflict/);
});
