import test from "node:test";
import assert from "node:assert/strict";
import {createQuotationDraftStorageClient} from "../public/js/quotation-draft-storage-client.mjs";
const draft={quoteNumber:"Q001",issueDate:"2026-11-15",customerName:"Synthetic",
 customerContact:"Gaborone",items:[{description:"Stone",quantity:1,unitPriceCents:120000}],discountCents:0};
const response=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"content-type":"application/json"}});
test("requires explicit capability and session-bound token",()=>{
 assert.throws(()=>createQuotationDraftStorageClient({enabled:false}),/disabled/);
 assert.throws(()=>createQuotationDraftStorageClient({
  enabled:true,fetchImpl:async()=>response({}),csrfToken:"short"
 }),/unconfigured/);
});
test("browser save/load uses same-origin and never supplies company ID",async()=>{
 const calls=[];
 const client=createQuotationDraftStorageClient({enabled:true,csrfToken:"synthetic-csrf-token",
  fetchImpl:async(path,options)=>{
   calls.push({path,options});
   return response({ok:true,draftId:"d1",revision:1,draft});
  }});
 assert.equal((await client.save({draftId:"d1",revision:0,draft})).revision,1);
 assert.equal((await client.load("d1")).draft.customerName,"Synthetic");
 assert.equal(calls[0].path,"/api/quotation/drafts");
 assert.equal(calls[0].options.method,"PUT");
 assert.equal(calls[0].options.credentials,"same-origin");
 assert.equal(calls[0].options.headers["x-csrf-token"],"synthetic-csrf-token");
 assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)).sort(),["draft","draftId","revision"]);
 assert.equal(calls[1].path,"/api/quotation/drafts?id=d1");
 assert.equal(calls[1].options.method,"GET");
 assert.equal(calls[1].options.credentials,"same-origin");
});
test("409 concurrency conflicts are distinct and never mistaken for saved",async()=>{
 const client=createQuotationDraftStorageClient({enabled:true,csrfToken:"synthetic-csrf-token",
  fetchImpl:async()=>response({ok:false,error:"quotation_draft_revision_conflict"},409)});
 await assert.rejects(client.save({draftId:"d1",revision:1,draft}),/quotation_draft_revision_conflict/);
});
test("invalid IDs and malformed server receipts are rejected",async()=>{
 let calls=0;
 const client=createQuotationDraftStorageClient({enabled:true,csrfToken:"synthetic-csrf-token",
  fetchImpl:async()=>{calls++;return response({ok:true,draftId:"d1",draft,revision:0})}});
 await assert.rejects(client.load("../bad"),/invalid_draft_id/);
 await assert.rejects(client.save({draftId:"bad/",revision:0,draft}),/invalid_quotation_draft/);
 assert.equal(calls,0);
 await assert.rejects(client.load("d1"),/invalid_quotation_draft_response/);
});
