import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsPrivateInvoiceDraftHandler} from "../server/essentials-private-invoice-draft-http.mjs";

const origin="https://essentials-staging.thebedesk.com";
const endpoint=origin+"/api/essentials/invoice-drafts";
const principal={authenticated:true,userId:"owner-1",tenantId:"tenant-a",permissions:["invoice:draft:create"]};
let transactionCalls=0;
const make=({session=principal,member={active:true,userId:"owner-1",tenantId:"tenant-a"},
 mutation=true,quoteStatus="accepted",existing=null,inserted=null}={})=>{
 transactionCalls=0;
 const repository={transaction:async callback=>{transactionCalls++;return callback({
  getDraftByIdempotencyKey:async()=>existing,
  getQuotationForTenant:async()=>({id:"quote-1",companyId:"tenant-a",customerId:"customer-1",
   reference:"Q-1",status:quoteStatus,items:[{description:"Stone",quantity:1,unitMinor:10000,lineMinor:10000}],
   discountMinor:0,totalMinor:10000}),
  reserveInvoiceReference:async()=> "INV-1",
  insertDraftInvoice:async()=>(inserted??{id:"draft-1",tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"draft",invoiceReference:"INV-1"})
 })}};
 return createEssentialsPrivateInvoiceDraftHandler({enabled:true,environment:"essentials-private-staging",
  allowedPrivateOrigin:origin,readVerifiedSession:async()=>session,
  verifyActiveMembership:async()=>member,verifyMutation:async()=>mutation,repository});
};
const req=({url=endpoint,method="POST",originHeader=origin,body={quotationId:"quote-1",idempotencyKey:"unique-1"},type="application/json"}={})=>
 new Request(url,{method,headers:{origin:originHeader,"content-type":type},
 ...(method==="POST"?{body:typeof body==="string"?body:JSON.stringify(body)}:{})});

test("unmounted private handler defaults closed and disallows public origin",()=>{
 assert.throws(()=>createEssentialsPrivateInvoiceDraftHandler(),/disabled/);
 assert.throws(()=>createEssentialsPrivateInvoiceDraftHandler({enabled:true,environment:"essentials-private-staging",
 allowedPrivateOrigin:"https://thebedesk.com",readVerifiedSession:()=>{},verifyActiveMembership:()=>{},
 verifyMutation:()=>{},repository:{transaction:()=>{}}}),/private_origin_required/);
});
test("creates a tenant-scoped draft only after verified session, membership and mutation",async()=>{
 const r=await make().handle(req());
 assert.equal(r.status,201);
 assert.deepEqual(await r.json(),{ok:true,replayed:false,invoice:{id:"draft-1",status:"draft",reference:"INV-1"}});
 assert.equal(transactionCalls,1);assert.equal(r.headers.get("cache-control"),"private, no-store");
});
test("rejects anonymous, other-tenant membership, invalid CSRF and missing origin without DB access",async()=>{
 for(const [handler,request,status] of [
 [make({session:null}),req(),401],
 [make({member:{active:true,userId:"owner-1",tenantId:"tenant-b"}}),req(),403],
 [make({mutation:false}),req(),403],
 [make(),req({originHeader:"https://attacker.example"}),403],
 [make({session:{...principal,permissions:[]}}),req(),403],
 ]){const r=await handler.handle(request);assert.equal(r.status,status);assert.equal(transactionCalls,0)}
});
test("denies unrelated routes, non-POST methods, and caller-supplied tenant IDs",async()=>{
 const h=make();
 assert.equal((await h.handle(req({url:origin+"/api/other"}))).status,404);
 assert.equal((await h.handle(req({method:"GET"}))).status,405);
 assert.equal((await h.handle(req({body:{quotationId:"quote-1",idempotencyKey:"x",tenantId:"tenant-b"}}))).status,400);
 assert.equal(transactionCalls,0);
});
test("denies unsupported types, malformed JSON and oversized bodies",async()=>{
 const h=make();
 assert.equal((await h.handle(req({type:"text/plain"}))).status,415);
 assert.equal((await h.handle(req({body:"not-json"}))).status,400);
 assert.equal((await h.handle(req({body:{quotationId:"quote-1",idempotencyKey:"x",padding:"x".repeat(4200)}}))).status,413);
 assert.equal(transactionCalls,0);
});
test("accepted-state and idempotency replay errors never issue invoices",async()=>{
 const pending=make({quoteStatus:"draft"});
 assert.equal((await pending.handle(req())).status,409);
 const replay=make({existing:{id:"existing",tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"draft",invoiceReference:"INV-1"}});
 const res=await replay.handle(req());assert.equal(res.status,200);
 assert.equal((await res.json()).replayed,true);
 const wrong=make({existing:{tenantId:"tenant-b",sourceQuotationId:"quote-1",status:"draft"}});
 assert.equal((await wrong.handle(req())).status,409);
});

test("private origin rejects unrelated HTTPS hosts, ports and public application hosts",()=>{
 const opts={enabled:true,environment:"essentials-private-staging",
  readVerifiedSession:async()=>principal,verifyActiveMembership:async()=>({active:true,userId:"owner-1",tenantId:"tenant-a"}),
  verifyMutation:async()=>true,repository:{transaction:async()=>{}}};
 for(const host of [
  "https://attacker.example","https://evilthebedesk.com",
  "https://app.thebedesk.com","https://www.thebedesk.com",
  "https://essentials-staging.thebedesk.com:8443","http://essentials-staging.thebedesk.com",
  "https://essentials-staging.thebedesk.com/path","https://essentials-staging.thebedesk.com?token=x"
 ])assert.throws(()=>createEssentialsPrivateInvoiceDraftHandler({...opts,allowedPrivateOrigin:host}),/private_origin_required/);
 assert.doesNotThrow(()=>createEssentialsPrivateInvoiceDraftHandler({...opts,allowedPrivateOrigin:origin}));
});
test("malformed repository success fails closed without claiming an invoice draft",async()=>{
 const invalid=[
  {id:"draft-1",tenantId:"tenant-b",sourceQuotationId:"quote-1",status:"draft",invoiceReference:"INV-1"},
  {id:"draft-1",tenantId:"tenant-a",sourceQuotationId:"other-quote",status:"draft",invoiceReference:"INV-1"},
  {id:"draft-1",tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"issued",invoiceReference:"INV-1"},
  {id:"draft-1",tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"draft",invoiceReference:"INV 1"},
  {id:null,tenantId:"tenant-a",sourceQuotationId:"quote-1",status:"draft",invoiceReference:"INV-1"}
 ];
 for(const inserted of invalid){
  const response=await make({inserted}).handle(req());
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false,error:"draft_creation_unavailable"});
  assert.equal(transactionCalls,1);
 }
});
