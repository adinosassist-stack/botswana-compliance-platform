import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsD1AtomicRepository} from "../server/essentials-d1-atomic-repository.mjs";

test("default-deny and reject absence of real atomic host",()=>{
 assert.throws(()=>createEssentialsD1AtomicRepository(),/disabled/);
 assert.throws(()=>createEssentialsD1AtomicRepository({enabled:true,environment:"essentials-private-staging"}),/atomic_transaction_required/);
});

test("reject unverified atomic context rather than accepting ordinary D1 prepare",async()=>{
 const r=createEssentialsD1AtomicRepository({enabled:true,environment:"essentials-private-staging",
  withAtomicTransaction:async cb=>cb({db:{prepare:()=>{}},tenantId:"tenant-a",atomic:false})});
 await assert.rejects(r.transaction(async()=>{}),/atomic_transaction_context_unverified/);
});

test("tenant-scoped quotation callback blocks a cross-tenant result",async()=>{
 let requested=0;
 const r=createEssentialsD1AtomicRepository({enabled:true,environment:"essentials-private-staging",
  withAtomicTransaction:async cb=>cb({
   atomic:true,tenantId:"tenant-a",actorUserId:"owner-1",db:{prepare:()=>{}},
   loadQuotationForTenant:async()=>{requested++;return {id:"quote-1",companyId:"tenant-b"}},
   reserveInvoiceReference:async()=> "INV-1",
   generateDraftId:async()=> "id-1"
  })});
 await assert.rejects(r.transaction(tx=>tx.getQuotationForTenant({tenantId:"tenant-b",quotationId:"quote-1"})),/tenant_access_denied/);
 await assert.rejects(r.transaction(tx=>tx.getQuotationForTenant({tenantId:"tenant-a",quotationId:"quote-1"})),/quotation_tenant_mismatch/);
 assert.equal(requested,1);
});

test("reject tenant-mismatched insert before touching D1",async()=>{
 let touched=0;
 const r=createEssentialsD1AtomicRepository({enabled:true,environment:"essentials-private-staging",
  withAtomicTransaction:async cb=>cb({
   atomic:true,tenantId:"tenant-a",actorUserId:"owner-1",
   db:{prepare:()=>{touched++;throw Error("should_not_touch_db")}},
   loadQuotationForTenant:async()=>null,reserveInvoiceReference:async()=> "INV-1",
   generateDraftId:async()=> "id-1"
  })});
 await assert.rejects(r.transaction(tx=>tx.insertDraftInvoice({
  tenantId:"tenant-b",sourceQuotationId:"quote-1",idempotencyKey:"key-1",
  draft:{status:"draft",tenantId:"tenant-b",customerId:"customer-1",invoiceReference:"INV-1"}
 })),/draft_tenant_mismatch/);
 assert.equal(touched,0);
});

test("reject invalid invoice references and zero-call fake transaction",async()=>{
 const r=createEssentialsD1AtomicRepository({enabled:true,environment:"essentials-private-staging",
  withAtomicTransaction:async cb=>cb({atomic:true,tenantId:"tenant-a",actorUserId:"owner-1",db:{prepare:()=>{}},
   loadQuotationForTenant:async()=>null,reserveInvoiceReference:async()=> "not a safe ref",
   generateDraftId:async()=> "id-1"})});
 await assert.rejects(r.transaction(tx=>tx.reserveInvoiceReference({tenantId:"tenant-a"})),/invalid_invoice_reference/);
 const fake=createEssentialsD1AtomicRepository({enabled:true,environment:"essentials-private-staging",
  withAtomicTransaction:async()=>({status:"draft"})});
 await assert.rejects(fake.transaction(async()=>{}),/atomic_transaction_not_executed/);
});
