/**
 * The real unmounted draft HTTP boundary, D1 adapter and browser client
 * composed end-to-end against a strict synthetic D1 emulator.
 * No live sessions, customer data, D1 bindings or Cloudflare resources.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {handleQuotationDraftPersistence} from "../server/quotation-draft-persistence-http.mjs";
import {createQuotationDraftD1Store} from "../server/quotation-draft-d1-store.mjs";
import {createQuotationDraftStorageClient} from "../public/js/quotation-draft-storage-client.mjs";

const endpoint="https://thebedesk.com/api/quotation/drafts";
const token="synthetic-csrf-token-for-tests";
const draft=()=>({
 quoteNumber:"SYN-001",issueDate:"2026-11-16",customerName:"Synthetic Staff",
 customerContact:"Gaborone Testing Only",paymentMethod:"Manual",
 items:[{description:"Headstone",quantity:2,unitPriceCents:125000}],
 discountCents:5000
});
function fixture(){
 const rows=new Map(),events=[];
 const db={prepare(sql){
  if(!sql.includes("quotation_drafts"))throw Error("unexpected_sql_table");
  if(!sql.includes("tenant_id"))throw Error("unscoped_quotation_d1_query");
  return {bind(...args){return {
   async first(){
    events.push("d1_read");
    if(!sql.startsWith("SELECT revision, draft_json"))throw Error("unsafe_d1_read");
    const item=rows.get(args[0]+"|"+args[1]);
    return item?structuredClone(item):null;
   },
   async run(){
    if(sql.startsWith("INSERT OR IGNORE INTO quotation_drafts")){
     const [company,id,text]=args,key=company+"|"+id;
     events.push("d1_create");
     if(rows.has(key))return {success:true,meta:{changes:0}};
     rows.set(key,{revision:1,draft_json:text});
     return {success:true,meta:{changes:1}};
    }
    if(sql.startsWith("UPDATE quotation_drafts SET revision=revision+1")){
     const [text,company,id,expected]=args,key=company+"|"+id;
     events.push("d1_update");
     const prior=rows.get(key);
     if(!prior||prior.revision!==expected)return {success:true,meta:{changes:0}};
     rows.set(key,{revision:expected+1,draft_json:text});
     return {success:true,meta:{changes:1}};
    }
    throw Error("unexpected_mutating_d1_sql");
   }
  }}}
 }};
 const store=createQuotationDraftD1Store({db});
 const actor={authenticated:true,syntheticSession:true};
 const authorization={
  assertCompanyReader:async({actor:a,companyId})=>a===actor&&companyId!=="blocked",
  assertCompanyEditor:async({actor:a,companyId})=>a===actor&&companyId!=="blocked"
 };
 const fetchFor=(companyId,csrf=token)=>async(path,init)=>{
  events.push("http_"+init.method+":"+companyId);
  return handleQuotationDraftPersistence({request:new Request(endpoint.replace(
   "/api/quotation/drafts",path),init),companyId,actor,authorization,store,
   verifyMutation:async({request})=>request.headers.get("x-csrf-token")===token});
 };
 const client=companyId=>createQuotationDraftStorageClient({
  enabled:true,csrfToken:token,fetchImpl:fetchFor(companyId)});
 return {client,fetchFor,rows,events};
}

test("authenticated A saves and reloads; same draft ID in B remains isolated",async()=>{
 const f=fixture(),a=f.client("tenantA"),b=f.client("tenantB");
 const created=await a.save({draftId:"ref01",revision:0,draft:draft()});
 assert.equal(created.revision,1);
 assert.equal(created.draft.customerName,"Synthetic Staff");
 assert.equal((await a.load("ref01")).draft.items[0].unitPriceCents,125000);
 await assert.rejects(b.load("ref01"),/quotation_draft_storage_unavailable/);
 const other={...draft(),customerName:"Different Synthetic"};
 await b.save({draftId:"ref01",revision:0,draft:other});
 assert.equal((await b.load("ref01")).draft.customerName,"Different Synthetic");
 assert.equal((await a.load("ref01")).draft.customerName,"Synthetic Staff");
});

test("atomic stale revision rejects losing writer and never edits approved row",async()=>{
 const f=fixture(),client=f.client("tenantA");
 await client.save({draftId:"race",revision:0,draft:draft()});
 const nextA={...draft(),customerName:"Synthetic Winner"};
 const nextB={...draft(),customerName:"Synthetic Loser"};
 const responses=await Promise.allSettled([
  client.save({draftId:"race",revision:1,draft:nextA}),
  client.save({draftId:"race",revision:1,draft:nextB})
 ]);
 assert.equal(responses.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(responses.filter(x=>x.status==="rejected").length,1);
 assert.match(String(responses.find(x=>x.status==="rejected").reason),
  /quotation_draft_revision_conflict/);
 const item=await client.load("race");
 assert.equal(item.revision,2);
 assert.equal(item.draft.customerName,"Synthetic Winner");
});

test("CSRF, permissions and forged envelope deny before D1 access",async()=>{
 const f=fixture(),bad=f.fetchFor("tenantA","synthetic-incorrect-token");
 // The server verifier compares its own token, not the caller-supplied
 // parameter. Request a malformed/missing header directly.
 const authResponse=await bad("/api/quotation/drafts",{method:"PUT",headers:{
  "content-type":"application/json","x-csrf-token":"forged"},
  body:JSON.stringify({draftId:"d1",revision:0,draft:draft()})});
 assert.equal(authResponse.status,403);
 const blocked=await f.fetchFor("blocked")("/api/quotation/drafts",{method:"PUT",
  headers:{"content-type":"application/json","x-csrf-token":token},
  body:JSON.stringify({draftId:"d1",revision:0,draft:draft()})});
 assert.equal(blocked.status,403);
 const forged=await f.fetchFor("tenantA")("/api/quotation/drafts",{method:"PUT",
  headers:{"content-type":"application/json","x-csrf-token":token},
  body:JSON.stringify({draftId:"d1",revision:0,draft:draft(),companyId:"tenantB"})});
 assert.equal(forged.status,400);
 assert.equal(f.events.filter(x=>x.startsWith("d1_")).length,0);
});

test("tampered stored D1 JSON is never returned to the user",async()=>{
 const f=fixture(),a=f.client("tenantA");
 await a.save({draftId:"d1",revision:0,draft:draft()});
 const row=f.rows.get("tenantA|d1");
 f.rows.set("tenantA|d1",{revision:row.revision,draft_json:
  '{"customerName":"PRIVATE_NOT_ALLOWED","items":[{"description":"Bad","quantity":1,"unitPriceCents":-10}]}'});
 await assert.rejects(a.load("d1"),/quotation_draft_storage_unavailable/);
 assert.equal(f.rows.get("tenantA|d1").revision,1);
});
