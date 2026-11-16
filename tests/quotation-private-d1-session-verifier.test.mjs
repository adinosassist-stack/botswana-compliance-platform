import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {createQuotationPrivateD1SessionVerifier} from "../server/quotation-private-d1-session-verifier.mjs";
import {createQuotationPrivateHostSessionGate} from "../server/quotation-private-host-session-gate.mjs";
const tenant="123e4567-e89b-42d3-a456-426614174000";
const other="11111111-1111-4111-8111-111111111111";
const user="22222222-2222-4222-8222-222222222222";
const secret="synthetic-private-session-secret-that-is-not-real";
const token="synthetic-test-cookie-token-that-is-not-real";
const csrf="synthetic-csrf-token-not-real";
const hash=createHmac("sha256",secret).update(token).digest("hex");
function fixture(opts={}){
 const calls=[];
 const mock={prepare(sql){return{bind(...args){return{async first(){
  calls.push({sql,args});
  if(opts.throwDb)throw Error("simulate unavailable auth DB");
  if(sql.includes("FROM sessions")){
   if(args[0]!==hash||args[1]!==tenant||opts.missingSession)return null;
   return {user_id:user,tenant_id:opts.wrongSessionTenant?other:tenant,
    role:opts.sessionRole||"owner",csrf_token:csrf};
  }
  if(sql.includes("FROM memberships")){
   if(args[0]!==tenant||args[1]!==user||opts.missingMembership)return null;
   return {user_id:user,tenant_id:opts.wrongMembershipTenant?other:tenant,
    role:opts.membershipRole||"owner"};
  }
  throw Error("unexpected SQL");
 }}}}}};
 const auth=createQuotationPrivateD1SessionVerifier({
  enabled:true,environment:"quotation-private-staging",authDb:mock,
  sessionSecret:secret,expectedTenantId:tenant
 });
 const request=(cookie=token,csrfToken=csrf)=>new Request("https://private.example.test/api/quotation/drafts",{
  headers:{cookie:cookie===null?"":"__Host-bw_session="+encodeURIComponent(cookie),
   "x-csrf-token":csrfToken}
 });
 const actor={userId:user,tenantId:tenant,role:"owner"};
 return {auth,request,actor,calls};
}
test("disabled and missing DB/secret and tenant fail closed",()=>{
 assert.throws(()=>createQuotationPrivateD1SessionVerifier(),/disabled/);
 assert.throws(()=>createQuotationPrivateD1SessionVerifier({
  enabled:true,environment:"quotation-private-staging"}),/unconfigured/);
});
test("valid signed session binds pinned tenant, not caller input",async()=>{
 const x=fixture();
 assert.deepEqual(await x.auth.readVerifiedSession({request:x.request()}),
  {authenticated:true,userId:user,tenantId:tenant,role:"owner"});
 assert.equal(x.calls.length,1);
 assert.deepEqual(x.calls[0].args,[hash,tenant]);
 assert.match(x.calls[0].sql,/session_generation=u\.session_generation/);
 assert.match(x.calls[0].sql,/m\.status='active'/);
});
test("unknown, missing and duplicate cookies fail closed",async()=>{
 const x=fixture();
 for(const req of [
  x.request(null),x.request("unknown-cookie-with-no-matching-hmac"),
  new Request("https://private.example.test",{headers:{
   cookie:"__Host-bw_session="+token+"; bw_session=duplicated"}})
 ])assert.equal(await x.auth.readVerifiedSession({request:req}),null);
 assert.equal(x.calls.length,1);
});
test("session wrong tenant, missing or unavailable fails",async()=>{
 for(const opts of [{wrongSessionTenant:true},{missingSession:true},{throwDb:true}]){
  const x=fixture(opts);
  assert.equal(await x.auth.readVerifiedSession({request:x.request()}),null);
 }
});
test("membership is rechecked, rejects stale roles and foreign tenant",async()=>{
 for(const opts of [
  {missingMembership:true},{wrongMembershipTenant:true},
  {membershipRole:"manager"},{throwDb:true}
 ]){
  const x=fixture(opts);
  assert.equal(await x.auth.verifyActiveMembership({actor:x.actor,
   tenantId:tenant,userId:user}),null);
 }
 const ok=fixture();
 assert.deepEqual(await ok.auth.verifyActiveMembership({
  actor:ok.actor,tenantId:tenant,userId:user}),
  {active:true,tenantId:tenant,userId:user,role:"owner"});
});
test("cross-tenant and actor mismatches do not query the database",async()=>{
 const x=fixture();
 assert.equal(await x.auth.verifyActiveMembership({actor:x.actor,tenantId:other,userId:user}),null);
 assert.equal(await x.auth.verifyMutation({request:x.request(),actor:x.actor,companyId:other}),false);
 assert.equal(x.calls.length,0);
});
test("mutation verifies CSRF token against fresh signed session",async()=>{
 const x=fixture();
 assert.equal(await x.auth.verifyMutation({request:x.request(),actor:x.actor,companyId:tenant}),true);
 assert.equal(await x.auth.verifyMutation({request:x.request(token,"incorrect-synthetic-token"),
  actor:x.actor,companyId:tenant}),false);
 assert.equal(await x.auth.verifyMutation({request:x.request(token,""),
  actor:x.actor,companyId:tenant}),false);
});
test("unavailable auth DB denies reads and writes without leaking errors",async()=>{
 const x=fixture({throwDb:true});
 assert.equal(await x.auth.verifyMutation({request:x.request(),actor:x.actor,companyId:tenant}),false);
 assert.equal(await x.auth.readVerifiedSession({request:x.request()}),null);
});

test("full synthetic host integration enforces tenant and CSRF before delegation",async()=>{
 const x=fixture();
 const origin="https://quotation-private.example.test";
 const calls=[];
 const gate=createQuotationPrivateHostSessionGate({
  environment:"quotation-private-staging",enabled:true,expectedTenantId:tenant,
  allowedPrivateOrigin:origin,
  readVerifiedSession:x.auth.readVerifiedSession,
  verifyActiveMembership:x.auth.verifyActiveMembership,
  verifyMutation:x.auth.verifyMutation,
  quotationHandlers:{async handle(context){
   calls.push(context);
   return new Response("synthetic-passed");
  }}
 });
 const good=new Request(origin+"/api/quotation/drafts?companyId="+other,{
  method:"POST",headers:{
   cookie:"__Host-bw_session="+token,origin,"x-csrf-token":csrf
  }
 });
 assert.equal((await gate.handle(good)).status,200);
 assert.equal(calls.length,1);
 assert.equal(calls[0].companyId,tenant);
 const wrong=new Request(origin+"/api/quotation/drafts",{
  method:"POST",headers:{
   cookie:"__Host-bw_session="+token,
   origin:"https://other.example.test","x-csrf-token":csrf
  }
 });
 assert.equal((await gate.handle(wrong)).status,403);
 const anonymous=new Request(origin+"/api/quotation/drafts");
 assert.equal((await gate.handle(anonymous)).status,401);
 assert.equal(calls.length,1);
});
