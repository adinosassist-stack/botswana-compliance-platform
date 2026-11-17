import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {createQuotationSyntheticPrivateIntegration}
 from "../server/quotation-synthetic-private-integration.mjs";

const authId="d7ad8e99-2ee4-446c-9358-0e186031571d";
const quoteId="aec227e9-b0f2-4b00-8de0-105465c4e2d6";
const tenant="123e4567-e89b-42d3-a456-426614174000";
const other="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const origin="https://quotation.private.example.test";
const sessionSecret="isolated-synthetic-session-secret-123456789";
const caller="isolated-private-service-caller-secret-123456789";
const cookie="synthetic-private-cookie-value-123456789";
const csrf="isolated-synthetic-csrf-123456789";
const hash=createHmac("sha256",sessionSecret).update(cookie).digest("hex");
const resources={
 authDbId:authId,quoteDbId:quoteId,
 logoBucket:"bw-quotation-logo-private-staging",
 templateBucket:"bw-quotation-template-private-staging"
};
function fixture(overrides={}){
 let sessionReads=0,quoteReads=0,quoteWrites=0,r2Writes=0;
 let role="owner",sessionTenant=tenant,active=true;
 const authDb={prepare(sql){return {bind(...args){return {async first(){
  sessionReads++;
  if(sql.includes("FROM sessions s")){
   if(args[0]!==hash||args[1]!==tenant||sessionTenant!==tenant||!active)return null;
   return {user_id:user,tenant_id:tenant,role,csrf_token:csrf};
  }
  if(sql.includes("FROM memberships m")){
   if(args[0]!==tenant||args[1]!==user||!active)return null;
   return {user_id:user,tenant_id:tenant,role};
  }
  throw Error("invalid_synthetic_auth_sql");
 }}}}}};
 const quoteDb={prepare(sql){return {bind(){return {
  async first(){quoteReads++;return null},
  async run(){quoteWrites++;throw Error("unexpected_private_write")}
 }}}}};
 const bucket={async get(){return null},async put(){r2Writes++},async delete(){r2Writes++}};
 const templates={async get(){return null}};
 const pdfLib={PDFDocument:{load:async()=>({}),create:async()=>({})}};
 const args={enabled:true,environment:"quotation-private-staging",
  expectedTenantId:tenant,allowedPrivateOrigin:origin,authDb,quoteDb,
  sessionSecret,internalCallerSecret:caller,
  privateLogoBucket:bucket,privateTemplateBucket:templates,
  approvedTemplates:{},pdfLib,resourceIdentity:resources,...overrides};
 const instance=createQuotationSyntheticPrivateIntegration(args);
 const request=(path="/api/quotation/drafts?id=draft01",options={})=>
  new Request(origin+path,{...options,headers:{
   cookie:"__Host-bw_session="+cookie,
   "x-quotation-private-caller":caller,...options.headers
  }});
 return {instance,request,args,counts:()=>({sessionReads,quoteReads,quoteWrites,r2Writes}),
  staff:()=>{role="staff"},wrongTenant:()=>{sessionTenant=other},revoke:()=>{active=false}};
}
test("disabled by default, refuses public origin and mismatched isolated bindings",()=>{
 assert.throws(()=>createQuotationSyntheticPrivateIntegration(),/disabled/);
 const f=fixture();
 assert.throws(()=>createQuotationSyntheticPrivateIntegration({...f.args,
  allowedPrivateOrigin:"https://thebedesk.com"}),/synthetic_origin_required/);
 assert.throws(()=>createQuotationSyntheticPrivateIntegration({...f.args,
  resourceIdentity:{...resources,quoteDbId:authId}}),/resource_identity_mismatch/);
 assert.throws(()=>createQuotationSyntheticPrivateIntegration({...f.args,
  quoteDb:f.args.authDb}),/db_isolation_required/);
 assert.throws(()=>createQuotationSyntheticPrivateIntegration({...f.args,
  internalCallerSecret:sessionSecret}),/internal_caller_unconfigured/);
});
test("no internal caller: opaque 404 before cookie, session, DB, or R2 access",async()=>{
 const f=fixture();
 let request=f.request("/api/quotation/drafts?id=draft01");
 request=new Request(request.url,{headers:{cookie:request.headers.get("cookie")}});
 const r=await f.instance.handle(request);
 assert.equal(r.status,404);
 assert.deepEqual(f.counts(),{sessionReads:0,quoteReads:0,quoteWrites:0,r2Writes:0});
 assert.equal(r.headers.get("cache-control"),"private, no-store");
});
test("valid verified owner reaches only tenant-scoped draft lookup, not a write",async()=>{
 const f=fixture();
 const r=await f.instance.handle(f.request());
 assert.equal(r.status,404);
 assert.deepEqual(await r.json(),{ok:false,error:"quotation_draft_not_found"});
 assert.ok(f.counts().sessionReads>0);
 assert.equal(f.counts().quoteReads,1);
 assert.equal(f.counts().quoteWrites,0);
});
test("wrong tenant and revoked session fail closed without draft queries",async()=>{
 for(const key of ["wrongTenant","revoke"]){
  const f=fixture();f[key]();
  const r=await f.instance.handle(f.request());
  assert.equal(r.status,401);
  assert.equal(f.counts().quoteReads,0);
 }
});
test("CSRF and origin denied before body or private D1/R2 write",async()=>{
 const f=fixture();
 for(const headers of [
  {origin, "x-csrf-token":"wrong"},
  {origin:"https://thebedesk.com","x-csrf-token":csrf},
  {"x-csrf-token":csrf}
 ]){
  const r=await f.instance.handle(f.request("/api/quotation/drafts",{
   method:"PUT",headers,body:JSON.stringify({draftId:"x",revision:0,draft:{}})
  }));
  assert.equal(r.status,403);
 }
 assert.equal(f.counts().quoteWrites,0);
 assert.equal(f.counts().r2Writes,0);
});
test("staff cannot mutate; foreign host and nonquotation path denied before D1",async()=>{
 const f=fixture();f.staff();
 const r=await f.instance.handle(f.request("/api/quotation/drafts",{
  method:"PUT",headers:{origin,"x-csrf-token":csrf},body:"{}"
 }));
 assert.equal(r.status,403);
 assert.equal(f.counts().quoteWrites,0);
 const foreign=new Request("https://thebedesk.com/api/quotation/drafts?id=x",{
  headers:{"x-quotation-private-caller":caller}
 });
 assert.equal((await f.instance.handle(foreign)).status,404);
 assert.equal((await f.instance.handle(f.request("/billing"))).status,404);
 assert.equal(f.counts().quoteReads,0);
});
test("no runtime fetch export and no production route is registered",async()=>{
 const mod=await import("../server/quotation-synthetic-private-integration.mjs");
 assert.equal(typeof mod.default,"undefined");
 assert.equal(typeof mod.createQuotationSyntheticPrivateIntegration,"function");
});
