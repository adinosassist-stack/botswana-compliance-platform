import test from "node:test";
import assert from "node:assert/strict";
import {insertOrReplayEssentialsDraftD1} from "../server/essentials-d1-idempotency.mjs";
const record={id:"draft-1",tenantId:"tenant-a",customerId:"customer-a",sourceQuotationId:"quote-1",idempotencyKey:"req-1",invoiceNumber:"INV-1",createdByUserId:"owner-1",draft:{status:"draft",tenantId:"tenant-a",customerId:"customer-a",invoiceReference:"INV-1"}};
const dbFor=(insertError,existing)=>({prepare:sql=>({bind:(...args)=>({run:async()=>{if(insertError)throw insertError;return {success:true};},first:async()=>existing})})});
test("returns newly inserted draft",async()=>{const x=await insertOrReplayEssentialsDraftD1({db:dbFor(null,null),record});assert.equal(x.replayed,false);});
test("replays matching request after concurrent unique conflict",async()=>{
 const existing={id:"draft-existing",tenant_id:"tenant-a",source_quotation_id:"quote-1",invoice_number:"INV-1",status:"draft"};
 const x=await insertOrReplayEssentialsDraftD1({db:dbFor(Error("UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.idempotency_key"),existing),record});
 assert.equal(x.replayed,true);assert.equal(x.invoice.id,"draft-existing");
});
test("does not swallow unrelated database failures or reference collisions",async()=>{
 await assert.rejects(insertOrReplayEssentialsDraftD1({db:dbFor(Error("database unavailable"),null),record}),/database unavailable/);
 await assert.rejects(insertOrReplayEssentialsDraftD1({db:dbFor(Error("UNIQUE constraint failed: essentials_invoice_drafts.invoice_number"),null),record}),/UNIQUE constraint failed/);
});
test("rejects conflicting reuse of idempotency key",async()=>{
 const existing={id:"other",tenant_id:"tenant-a",source_quotation_id:"quote-2",invoice_number:"INV-2",status:"draft"};
 await assert.rejects(insertOrReplayEssentialsDraftD1({db:dbFor(Error("UNIQUE constraint failed"),existing),record}),/idempotency_conflict/);
});
