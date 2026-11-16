import test from "node:test";
import assert from "node:assert/strict";
import {handleQuotationDraftPersistence} from "../server/quotation-draft-persistence-http.mjs";

const url="https://thebedesk.com/api/quotation/drafts";
const actor={verifiedSession:true};
const validDraft=()=>({
 quoteNumber:"QT-001",issueDate:"2026-11-15",
 customerName:"Synthetic Customer",customerContact:"Gaborone",
 items:[{description:"Memorial",quantity:2,unitPriceCents:125000}],
 discountCents:5000
});
function setup(){
 const rows=new Map();
 const events=[];
 const authorization={
  assertCompanyReader:async({actor:a,companyId})=>a===actor&&companyId!=="denied",
  assertCompanyEditor:async({actor:a,companyId})=>a===actor&&companyId!=="denied"
 };
 const verifyMutation=async({request})=>request.headers.get("x-csrf-token")==="valid-csrf";
 // Fixture only. A real adapter must implement transactional CAS in D1,
 // but this in-memory fixture never touches customer data or Cloudflare.
 const store={
  async read({companyId,draftId}){
   events.push("read:"+companyId);
   const row=rows.get(companyId+"|"+draftId);
   return row?structuredClone(row):null;
  },
  async save({companyId,draftId,expectedRevision,draft}){
   events.push("save:"+companyId);
   const key=companyId+"|"+draftId,prior=rows.get(key);
   if((prior?.revision??0)!==expectedRevision)return {conflict:true};
   const row={revision:expectedRevision+1,draft:structuredClone(draft)};
   rows.set(key,row);return structuredClone(row);
  }
 };
 const run=({method="GET",companyId="companyA",id="draft01",
  body=null,token="valid-csrf",overrides={}}={})=>{
  const target=method==="GET"?url+"?id="+encodeURIComponent(id):url;
  return handleQuotationDraftPersistence({
   request:new Request(target,{method,headers:{
    "content-type":"application/json","x-csrf-token":token
   },body:method==="GET"?undefined:JSON.stringify(body??{
    draftId:id,revision:0,draft:validDraft()
   })}),
   actor,companyId,authorization,verifyMutation,store,...overrides
  });
 };
 return {run,events,rows,store};
}
test("unmounted handler saves, reads and updates a private synthetic draft",async()=>{
 const {run}=setup();
 assert.equal((await run()).status,404);
 const save=await run({method:"PUT"});assert.equal(save.status,200);
 const receipt=await save.json();
 assert.equal(receipt.revision,1);
 assert.equal(receipt.draft.items[0].unitPriceCents,125000);
 const read=await run();assert.equal(read.status,200);
 assert.equal((await read.json()).revision,1);
 const change=validDraft();change.items[0].unitPriceCents=160000;
 const edited=await run({method:"PUT",body:{draftId:"draft01",revision:1,draft:change}});
 assert.equal(edited.status,200);
 assert.equal((await edited.json()).revision,2);
 assert.equal((await (await run()).json()).draft.items[0].unitPriceCents,160000);
});
test("cross-company reads never expose another company's draft",async()=>{
 const {run}=setup();
 assert.equal((await run({method:"PUT"})).status,200);
 assert.equal((await run({companyId:"companyB"})).status,404);
 assert.equal((await run({companyId:"companyB",method:"PUT"})).status,200);
 assert.equal((await (await run()).json()).revision,1);
});
test("stale save fails with 409 without overwriting newer content",async()=>{
 const {run}=setup();await run({method:"PUT"});
 const newer=validDraft();newer.customerName="New customer";
 assert.equal((await run({method:"PUT",body:{draftId:"draft01",revision:1,draft:newer}})).status,200);
 const stale=validDraft();stale.customerName="Stale customer";
 const response=await run({method:"PUT",body:{draftId:"draft01",revision:1,draft:stale}});
 assert.equal(response.status,409);
 assert.equal((await (await run()).json()).draft.customerName,"New customer");
});
test("access and CSRF denials run before request body or private store",async()=>{
 const {run,events}=setup();
 const payload={draftId:"draft01",revision:0,draft:validDraft()};
 assert.equal((await run({method:"PUT",companyId:"denied",body:payload})).status,403);
 assert.equal((await run({method:"PUT",token:"invalid",body:payload})).status,403);
 assert.equal((await run({companyId:"denied"})).status,403);
 assert.deepEqual(events,[]);
});
test("server validates all monetary values and rejects untrusted fields",async()=>{
 const {run,events}=setup();
 const bad=validDraft();bad.items[0].unitPriceCents=-1;
 assert.equal((await run({method:"PUT",body:{draftId:"draft01",revision:0,draft:bad}})).status,400);
 assert.equal((await run({method:"PUT",body:{
  draftId:"draft01",revision:0,draft:validDraft(),companyId:"companyB"
 }})).status,400);
 assert.equal((await run({method:"PUT",body:{
  draftId:"draft01",revision:0,draft:{...validDraft(),subtotalCents:1}
 }})).status,400);
 assert.deepEqual(events,[]);
});
test("unconfigured store and bad draft IDs fail closed",async()=>{
 const {run}=setup();
 assert.equal((await run({overrides:{store:null}})).status,503);
 assert.equal((await run({id:"bad/id"})).status,400);
 assert.equal((await run({method:"PUT",body:{
  draftId:"bad/id",revision:0,draft:validDraft()
 }})).status,400);
});
