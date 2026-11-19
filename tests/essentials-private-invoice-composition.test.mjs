import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsPrivateInvoiceComposition} from "../server/essentials-private-invoice-composition.mjs";

const principal={userId:"owner-1",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
const quotation={id:"quote-1",companyId:"tenant-a",customerId:"customer-a",reference:"Q-1",status:"accepted",
 items:[{description:"Stone",quantity:1,unitMinor:10000,lineMinor:10000}],
 discountMinor:0,totalMinor:10000};
const uuids=["df5e70af-71be-4c7b-900c-dfe1048cf760","c9beed62-315b-4ec1-9a24-b8badc0d8ac0"];
const setup=({quote=quotation,loadFailure=false}={})=>{
 let loads=0,batches=0,prepared=[];
 const db={prepare:sql=>({bind:(...values)=>{prepared.push({sql,values});return {sql,values}}}),
  batch:async statements=>{
   batches++;assert.equal(statements.length,2);
   const [id,tenant,customer,source,key,invoice,payload,actor]=statements[0].values;
   return [{success:true,results:[]},{success:true,results:[{
    id,tenant_id:tenant,customer_id:customer,source_quotation_id:source,
    idempotency_key:key,invoice_number:invoice,status:"draft",created_by_user_id:actor
   }]}];
  }};
 let n=0;
 const service=createEssentialsPrivateInvoiceComposition({
  enabled:true,environment:"essentials-private-staging",
  loadAcceptedQuotationForTenant:async args=>{
   loads++;assert.equal(args.tenantId,"tenant-a");
   if(loadFailure)throw Error("trusted_lookup_unavailable");
   return quote;
  },db,randomUUID:()=>uuids[n++]
 });
 return {service,metrics:()=>({loads,batches,prepared})};
};
const input={principal,quotationId:"quote-1",idempotencyKey:"key-1",createdAt:"2026-11-18"};
test("remains disabled and requires real trusted callbacks and D1 batch",()=>{
 assert.throws(()=>createEssentialsPrivateInvoiceComposition(),/disabled/);
 assert.throws(()=>createEssentialsPrivateInvoiceComposition({enabled:true,environment:"essentials-private-staging",db:{prepare:()=>{}}}),/unconfigured/);
});
test("composes server-generated draft from trusted accepted quote and one atomic D1 batch",async()=>{
 const {service,metrics}=setup();
 const result=await service.createDraft(input);
 assert.equal(result.replayed,false);
 assert.equal(result.invoice.id,"ess_c9beed62315b4ec19a24b8badc0d8ac0");
 assert.equal(result.invoice.invoiceReference,"ED_DF5E70AF71BE4C7B900CDFE1048CF760");
 assert.equal(metrics().loads,1);assert.equal(metrics().batches,1);
 const record=JSON.parse(metrics().prepared[0].values[6]);
 assert.equal(record.status,"draft");assert.equal(record.tenantId,"tenant-a");
 assert.equal(record.totalMinor,10000);
});
test("denies missing permissions and invalid request before tenant lookup or D1 writes",async()=>{
 const {service,metrics}=setup();
 await assert.rejects(service.createDraft({...input,principal:{...principal,permissions:[]}}),/permission_denied/);
 await assert.rejects(service.createDraft({...input,quotationId:"../../wrong"}),/invalid_request/);
 assert.equal(metrics().loads,0);assert.equal(metrics().batches,0);
});
test("denies cross-tenant, unaccepted, nonexistent and unavailable source quotations",async()=>{
 for(const [options,error] of [
  [{quote:{...quotation,companyId:"tenant-b"}},"quotation_tenant_mismatch"],
  [{quote:{...quotation,status:"draft"}},"quotation_not_accepted"],
  [{quote:null},"quotation_not_found"],
  [{loadFailure:true},"trusted_lookup_unavailable"]
 ]){
  const {service,metrics}=setup(options);
  await assert.rejects(service.createDraft(input),new RegExp(error));
  assert.equal(metrics().batches,0);
 }
});
test("request cannot authorize client-owned tenant fields",async()=>{
 const {service,metrics}=setup();
 await assert.rejects(service.createDraft({...input,principal:{...principal,tenantId:"tenant-b"}}));
 assert.equal(metrics().batches,0);
});
