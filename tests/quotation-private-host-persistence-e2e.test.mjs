/**
 * Executable synthetic end-to-end quotation persistence contract, SOURCE ONLY.
 * Real production and Cloudflare D1/R2 data are never accessed.
 * Calls the internal service-binding host with D1-like SQL mocks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {createQuotationPrivateServiceBindingHost}
 from "../server/quotation-private-service-binding-host.mjs";

const tenant="123e4567-e89b-42d3-a456-426614174000";
const outsider="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const origin="https://quotation.internal.example.test";
const cookie="synthetic-session-cookie-for-staging";
const csrf="synthetic-csrf-token-for-staging";
const sessionSecret="synthetic-session-hmac-long-secret-123456";
const callerSecret="synthetic-internal-caller-long-secret-123456";
const tokenHash=createHmac("sha256",sessionSecret).update(cookie).digest("hex");
const proof=Object.freeze({
 account:"ddd23cab31928a4bb3d4998df9b26d1d",
 worker:"bcaaf366ef7349a1a76a3a66735cb3af",
 authDbId:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDbId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBucket:"bw-quotation-logo-private-staging",
 templateBucket:"bw-quotation-template-private-staging",
 verifiedByIndependentPreflight:true,
 publicAndPreviewUrlsDisabled:true,
 productionBindingsAbsent:true,currentSourceApproved:true
});
const draft=(name="Synthetic Customer")=>({
 quoteNumber:"TEST-001",issueDate:"2026-11-16",customerName:name,
 customerContact:"Synthetic number only",
 items:[
  {description:"Concrete",quantity:1,unitPriceCents:150000},
  {description:"Grout 2kg",quantity:1,unitPriceCents:20000}
 ],
 discountCents:0,paymentMethod:"Manual payment"
});
function fixture(){
 const rows=new Map();
 let authReads=0,quoteReads=0,quoteWrites=0,role="owner",active=true,sessionTenant=tenant;
 const authDb={prepare(sql){return {bind(...args){return {
  async first(){
   authReads++;
   if(sql.includes("FROM sessions s")){
    if(args[0]!==tokenHash||args[1]!==tenant||!active||sessionTenant!==tenant)
     return null;
    return {user_id:user,tenant_id:tenant,role,csrf_token:csrf};
   }
   if(sql.includes("FROM memberships m")){
    if(args[0]!==tenant||args[1]!==user||!active)return null;
    return {user_id:user,tenant_id:tenant,role};
   }
   throw Error("unexpected_auth_sql");
  }
 }}}}};
 const quoteDb={prepare(sql){return {bind(...args){return {
  async first(){
   quoteReads++;
   if(sql.includes("FROM quotation_drafts")){
    const row=rows.get(args[0]+"|"+args[1]);
    return row?structuredClone(row):null;
   }
   throw Error("unexpected_quote_read");
  },
  async run(){
   quoteWrites++;
   if(sql.startsWith("INSERT OR IGNORE INTO quotation_drafts")){
    const [id,quoteId,text]=args,key=id+"|"+quoteId;
    if(rows.has(key))return {success:true,meta:{changes:0}};
    rows.set(key,{revision:1,draft_json:text});
    return {success:true,meta:{changes:1}};
   }
   if(sql.startsWith("UPDATE quotation_drafts")){
    const [text,id,quoteId,revision]=args,key=id+"|"+quoteId;
    const row=rows.get(key);
    if(!row||row.revision!==revision)return {success:true,meta:{changes:0}};
    rows.set(key,{revision:revision+1,draft_json:text});
    return {success:true,meta:{changes:1}};
   }
   throw Error("unexpected_quote_write");
  }
 }}}}};
 const logo={async get(){return null},async put(){throw Error("unexpected_logo_write")},async delete(){throw Error("unexpected_logo_delete")}};
 const templates={async get(){return null}};
 const pdfLib={PDFDocument:{load:async()=>({}),create:async()=>({})}};
 const env={
  QUOTATION_PRIVATE_STAGE:"synthetic-internal-only",
  QUOTATION_PRIVATE_ORIGIN:origin,QUOTATION_PRIVATE_TENANT_ID:tenant,
  QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:callerSecret,
  QUOTATION_PRIVATE_SESSION_SECRET:sessionSecret,
  AUTH_DB:authDb,QUOTE_DB:quoteDb,LOGO_R2:logo,TEMPLATE_R2:templates
 };
 const host=createQuotationPrivateServiceBindingHost({
  env,resourceProof:proof,pdfLib,approvedTemplates:{}
 });
 const request=(path="/api/quotation/drafts?id=demo",init={})=>
  new Request(origin+path,{...init,headers:{
   cookie:"__Host-bw_session="+cookie,
   "x-quotation-private-caller":callerSecret,
   ...init.headers
  }});
 const put=(revision,body=draft())=>request("/api/quotation/drafts",{
  method:"PUT",headers:{"content-type":"application/json",origin,"x-csrf-token":csrf},
  body:JSON.stringify({draftId:"demo",revision,draft:body})
 });
 return {host,request,put,rows,authDb,quoteDb,
  setRole:r=>{role=r},revoke:()=>{active=false},wrongTenant:()=>{sessionTenant=outsider},
  counts:()=>({authReads,quoteReads,quoteWrites})
 };
}
test("private session owner creates, reloads, updates, and rejects a stale revision",async()=>{
 const f=fixture();
 const created=await f.host.handleInternal(f.put(0));
 assert.equal(created.status,200,await created.clone().text());
 assert.equal((await created.json()).revision,1);
 const loaded=await f.host.handleInternal(f.request());
 assert.equal(loaded.status,200,await loaded.clone().text());
 const item=await loaded.json();
 assert.equal(item.draft.customerName,"Synthetic Customer");
 assert.deepEqual(item.draft.items.map(x=>x.description),["Concrete","Grout 2kg"]);
 const updated=await f.host.handleInternal(f.put(1,draft("Changed Synthetic")));
 assert.equal(updated.status,200,await updated.clone().text());
 assert.equal((await updated.json()).revision,2);
 assert.equal((await f.host.handleInternal(f.put(1))).status,409);
 const again=await (await f.host.handleInternal(f.request())).json();
 assert.equal(again.revision,2);
 assert.equal(again.draft.customerName,"Changed Synthetic");
 assert.equal(f.rows.size,1);
 assert.equal(f.rows.has(tenant+"|demo"),true);
});
test("private caller and foreign origins deny before auth or quote database reads",async()=>{
 const f=fixture();
 const noCaller=new Request(origin+"/api/quotation/drafts?id=demo",{headers:{
  cookie:"__Host-bw_session="+cookie
 }});
 assert.equal((await f.host.handleInternal(noCaller)).status,404);
 assert.deepEqual(f.counts(),{authReads:0,quoteReads:0,quoteWrites:0});
 const foreign=new Request("https://thebedesk.com/api/quotation/drafts?id=demo",{headers:{
  cookie:"__Host-bw_session="+cookie,"x-quotation-private-caller":callerSecret
 }});
 assert.equal((await f.host.handleInternal(foreign)).status,404);
 assert.deepEqual(f.counts(),{authReads:0,quoteReads:0,quoteWrites:0});
});
test("revoked/wrong tenant sessions cannot read or write quotation data",async()=>{
 for(const method of ["revoke","wrongTenant"]){
  const f=fixture();f[method]();
  assert.equal((await f.host.handleInternal(f.request())).status,401);
  assert.equal((await f.host.handleInternal(f.put(0))).status,401);
  assert.equal(f.counts().quoteReads,0);
  assert.equal(f.counts().quoteWrites,0);
 }
});
test("staff, invalid CSRF and forged origin cannot mutate D1",async()=>{
 const staff=fixture();staff.setRole("staff");
 assert.equal((await staff.host.handleInternal(staff.put(0))).status,403);
 assert.equal(staff.counts().quoteWrites,0);
 const f=fixture();
 const badCsrf=f.request("/api/quotation/drafts",{method:"PUT",headers:{
  "content-type":"application/json",origin,"x-csrf-token":"forged"
 },body:JSON.stringify({draftId:"demo",revision:0,draft:draft()})});
 assert.equal((await f.host.handleInternal(badCsrf)).status,403);
 const wrongOrigin=f.request("/api/quotation/drafts",{method:"PUT",headers:{
  "content-type":"application/json",origin:"https://thebedesk.com","x-csrf-token":csrf
 },body:JSON.stringify({draftId:"demo",revision:0,draft:draft()})});
 assert.equal((await f.host.handleInternal(wrongOrigin)).status,403);
 assert.equal(f.counts().quoteWrites,0);
});
test("no private issuance endpoint exists",async()=>{
 const f=fixture();
 const res=await f.host.handleInternal(f.request("/api/quotation/issue",{method:"POST",headers:{
  origin,"x-csrf-token":csrf
 },body:"{}"}));
 assert.equal(res.status,404);
 assert.equal(f.counts().quoteWrites,0);
});
