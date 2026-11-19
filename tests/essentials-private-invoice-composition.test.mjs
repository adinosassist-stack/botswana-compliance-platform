import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsPrivateInvoiceComposition} from "../server/essentials-private-invoice-composition.mjs";

const principal={userId:"owner-1",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
const quotation={id:"quote-1",companyId:"tenant-a",customerId:"customer-a",
 reference:"Q-1",status:"accepted",
 items:[{description:"Stone",quantity:1,unitMinor:10000,lineMinor:10000}],
 discountMinor:0,totalMinor:10000};
const uuids=["df5e70af-71be-4c7b-900c-dfe1048cf760",
 "c9beed62-315b-4ec1-9a24-b8badc0d8ac0"];
const input={principal,quotationId:"quote-1",idempotencyKey:"key-1",createdAt:"2026-11-18"};

function setup({quote=quotation,loadFailure=false,existing=null,insertError=null}={}){
 const counts={loads:0,reads:0,batches:0};const prepared=[];
 const db={prepare:sql=>({bind:(...values)=>{
   prepared.push({sql,values});
   return {sql,values,first:async()=>{
    counts.reads++;
    return typeof existing==="function"?existing(counts.reads):existing;
   }};
  }}),batch:async statements=>{
   counts.batches++;assert.equal(statements.length,2);
   if(insertError)throw Error(insertError);
   const [id,tenant,customer,source,key,invoice,payload,actor]=statements[0].values;
   return [{success:true,results:[]},{success:true,results:[{
    id,tenant_id:tenant,customer_id:customer,source_quotation_id:source,
    idempotency_key:key,invoice_number:invoice,status:"draft",created_by_user_id:actor
   }]}];
  }};
 let next=0;
 const service=createEssentialsPrivateInvoiceComposition({
  enabled:true,environment:"essentials-private-staging",
  loadAcceptedQuotationForTenant:async args=>{
   counts.loads++;assert.equal(args.tenantId,"tenant-a");
   if(loadFailure)throw Error("trusted_lookup_unavailable");
   return quote;
  },db,randomUUID:()=>uuids[next++]
 });
 return {service,counts,prepared};
}
function saved(overrides={}){
 return {id:"draft-old",tenant_id:"tenant-a",customer_id:"customer-a",
  source_quotation_id:"quote-1",invoice_number:"ED_ORIGINAL",
  status:"draft",created_by_user_id:"owner-1",
  draft_payload_json:JSON.stringify({
   tenantId:"tenant-a",customerId:"customer-a",
   sourceQuotationReference:"Q-1",invoiceReference:"ED_ORIGINAL",
   createdAt:"2026-11-18",status:"draft",currency:"BWP",
   items:[{description:"Stone",quantity:1,unitMinor:10000,lineMinor:10000}],
   subtotalMinor:10000,discountMinor:0,totalMinor:10000
  }),...overrides};
}
test("remains disabled and requires trusted callbacks and D1 batch",()=>{
 assert.throws(()=>createEssentialsPrivateInvoiceComposition(),/disabled/);
 assert.throws(()=>createEssentialsPrivateInvoiceComposition({
  enabled:true,environment:"essentials-private-staging",db:{prepare:()=>{}}
 }),/unconfigured/);
});
test("writes a new tenant-scoped invoice draft through the atomic D1 batch",async()=>{
 const {service,counts,prepared}=setup();
 const result=await service.createDraft(input);
 assert.equal(result.replayed,false);
 assert.equal(result.invoice.id,"ess_c9beed62315b4ec19a24b8badc0d8ac0");
 assert.equal(result.invoice.invoiceReference,"ED_DF5E70AF71BE4C7B900CDFE1048CF760");
 assert.equal(counts.loads,1);assert.equal(counts.reads,1);assert.equal(counts.batches,1);
 const bound=prepared.find(s=>s.sql.startsWith("INSERT INTO essentials_invoice_drafts"));
 const payload=JSON.parse(bound.values[6]);
 assert.equal(payload.status,"draft");
 assert.equal(payload.tenantId,"tenant-a");
 assert.equal(payload.totalMinor,10000);
});
test("reuses the original reference on matching application-level replay",async()=>{
 const {service,counts}=setup({existing:saved()});
 const result=await service.createDraft(input);
 assert.equal(result.replayed,true);
 assert.equal(result.invoice.id,"draft-old");
 assert.equal(result.invoice.invoiceReference,"ED_ORIGINAL");
 assert.equal(counts.loads,1);assert.equal(counts.reads,1);assert.equal(counts.batches,0);
});
test("concurrent same-key D1 conflict may replay only a matching record",async()=>{
 const {service,counts}=setup({
  existing:read=>read===1?null:saved(),
  insertError:"UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.idempotency_key"
 });
 const result=await service.createDraft(input);
 assert.equal(result.replayed,true);assert.equal(result.invoice.invoiceReference,"ED_ORIGINAL");
 assert.equal(counts.reads,2);assert.equal(counts.batches,1);
});
test("changed quotation contents or creator reject same-key replay",async()=>{
 for(const existing of [
  saved({created_by_user_id:"different-user"}),
  saved({source_quotation_id:"other-quote"}),
  saved({draft_payload_json:JSON.stringify({
   ...JSON.parse(saved().draft_payload_json),totalMinor:20000
  })})
 ]){
  const {service,counts}=setup({existing});
  await assert.rejects(service.createDraft(input),/idempotency_conflict/);
  assert.equal(counts.batches,0);
 }
});
test("does not swallow invoice-number collision or database outage",async()=>{
 for(const message of [
  "UNIQUE constraint failed: essentials_invoice_drafts.tenant_id, essentials_invoice_drafts.invoice_number",
  "database unavailable"
 ]){
  const {service,counts}=setup({insertError:message});
  await assert.rejects(service.createDraft(input),err=>err.message===message);
  assert.equal(counts.batches,1);
 }
});
test("denies missing permissions and invalid request before quote lookup",async()=>{
 const {service,counts}=setup();
 await assert.rejects(service.createDraft({...input,principal:{...principal,permissions:[]}}),/permission_denied/);
 await assert.rejects(service.createDraft({...input,quotationId:"../../wrong"}),/invalid_request/);
 assert.equal(counts.loads,0);assert.equal(counts.batches,0);
});
test("denies cross-tenant, unaccepted, nonexistent and unavailable quotations",async()=>{
 for(const [options,error] of [
  [{quote:{...quotation,companyId:"tenant-b"}},"quotation_tenant_mismatch"],
  [{quote:{...quotation,status:"draft"}},"quotation_not_accepted"],
  [{quote:null},"quotation_not_found"],
  [{loadFailure:true},"trusted_lookup_unavailable"]
 ]){
  const {service,counts}=setup(options);
  await assert.rejects(service.createDraft(input),new RegExp(error));
  assert.equal(counts.batches,0);
 }
});
test("refuses client-claimed tenant identity against trusted source",async()=>{
 const {service,counts}=setup();
 await assert.rejects(service.createDraft({...input,principal:{...principal,tenantId:"tenant-b"}}));
 assert.equal(counts.batches,0);
});
