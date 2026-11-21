import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsPrivateGuardedDraftHandler}
 from "../server/essentials-private-guarded-draft-http.mjs";

const origin="https://essentials-staging.thebedesk.com";
const path=origin+"/api/essentials/private/guarded-invoice-drafts";
const session={authenticated:true,userId:"userA",tenantId:"tenantA",
 permissions:["invoice:draft:create"]};
const member={active:true,userId:"userA",tenantId:"tenantA"};
function fixture({actor=session,membership=member,mutation=true,
 create=async()=>({replayed:false,invoice:{id:"draftA",tenantId:"tenantA",sourceQuotationId:"quoteA",status:"draft",invoiceReference:"ED-1"}})}={}){
 let writes=0,call=null;
 const handler=createEssentialsPrivateGuardedDraftHandler({
  enabled:true,environment:"essentials-private-staging",
  allowedPrivateOrigin:origin,
  readVerifiedSession:async()=>actor,verifyActiveMembership:async()=>membership,
  verifyMutation:async()=>mutation,
  guardedComposition:{createDraft:async args=>{writes++;call=args;return create(args)}}
 });
 return {handler,stats:()=>({writes,call})};
}
const request=({url=path,method="POST",originHeader=origin,
 body={quotationId:"quoteA",idempotencyKey:"keyA"},type="application/json"}={})=>
 new Request(url,{method,headers:{origin:originHeader,"content-type":type},
  ...(method==="POST"?{body:typeof body==="string"?body:JSON.stringify(body)}:{})});

test("unmounted handler requires explicit private staging, callbacks and nonpublic origin",()=>{
 assert.throws(()=>createEssentialsPrivateGuardedDraftHandler(),/guarded_http_disabled/);
 assert.throws(()=>createEssentialsPrivateGuardedDraftHandler({
  enabled:true,environment:"essentials-private-staging"
 }),/guarded_http_unconfigured/);
 for(const forbidden of ["https://thebedesk.com","https://app.thebedesk.com",
   "http://essentials-staging.thebedesk.com","https://unrelated.example",
   "https://essentials-staging.thebedesk.com:8443"]){
  assert.throws(()=>createEssentialsPrivateGuardedDraftHandler({
   enabled:true,environment:"essentials-private-staging",allowedPrivateOrigin:forbidden,
   readVerifiedSession:async()=>session,verifyActiveMembership:async()=>member,
   verifyMutation:async()=>true,guardedComposition:{createDraft:async()=>{}}
  }),/private_origin_required/,forbidden);
 }
});
test("successful private request forwards server session identity only, returns draft with no-store",async()=>{
 const f=fixture();const response=await f.handler.handle(request());
 assert.equal(response.status,201);
 assert.equal(response.headers.get("cache-control"),"private, no-store");
 assert.deepEqual(await response.json(),{
  ok:true,replayed:false,invoice:{id:"draftA",status:"draft",reference:"ED-1"}
 });
 assert.deepEqual(f.stats().call.principal,{
  tenantId:"tenantA",userId:"userA",permissions:["invoice:draft:create"]
 });
 assert.equal(f.stats().call.quotationId,"quoteA");
 assert.equal(f.stats().call.idempotencyKey,"keyA");
});
test("replay preserves original server-generated invoice reference",async()=>{
 const f=fixture({create:async()=>({replayed:true,invoice:{
  id:"original",tenantId:"tenantA",sourceQuotationId:"quoteA",status:"draft",invoiceReference:"ED-original"
 }})});
 const res=await f.handler.handle(request());
 assert.equal(res.status,200);assert.equal((await res.json()).invoice.reference,"ED-original");
 assert.equal(f.stats().writes,1);
});
test("rejects unauthenticated, incorrect membership, permission, origin and CSRF before composition",async()=>{
 for(const [options,req,status] of [
  [{actor:null},{},401],
  [{actor:{...session,permissions:[]}},{},403],
  [{membership:{...member,tenantId:"tenantB"}},{},403],
  [{membership:{...member,userId:"other"}},{},403],
  [{mutation:false},{},403],
  [{}, {originHeader:"https://attacker.example"},403]
 ]){
  const f=fixture(options);const res=await f.handler.handle(request(req));
  assert.equal(res.status,status);assert.equal(f.stats().writes,0);
 }
});
test("denies client-supplied tenant, amounts, customer and acceptance claims",async()=>{
 const f=fixture();
 for(const field of ["tenantId","customerId","totalMinor","acceptanceVersion",
  "invoiceNumber","acceptedByUserId"]){
  const body={quotationId:"quoteA",idempotencyKey:"keyA",[field]:"attacker"};
  const res=await f.handler.handle(request({body}));
  assert.equal(res.status,400,field);
 }
 assert.equal(f.stats().writes,0);
});
test("rejects path, method, unsupported content, oversized and malformed bodies",async()=>{
 const f=fixture();
 assert.equal((await f.handler.handle(request({url:origin+"/api/else"}))).status,404);
 assert.equal((await f.handler.handle(request({method:"GET"}))).status,405);
 assert.equal((await f.handler.handle(request({type:"text/plain"}))).status,415);
 assert.equal((await f.handler.handle(request({body:"not-json"}))).status,400);
 assert.equal((await f.handler.handle(request({body:"x".repeat(5000)}))).status,413);
 assert.equal(f.stats().writes,0);
});
test("unaccepted, revoked or mismatched retry fails closed without issued invoice",async()=>{
 for(const [message,status] of [
  ["quotation_not_accepted",409],["acceptance_stale_or_unverified",409],
  ["idempotency_conflict",409],["quotation_not_found",404],
  ["permission_denied",403],["d1_unavailable",503]
 ]){
  const f=fixture({create:async()=>{throw Error(message)}});
  const res=await f.handler.handle(request());
  assert.equal(res.status,status,message);
  const body=await res.json();assert.equal(body.ok,false);
  assert.equal("invoice" in body,false);
 }
});
test("malformed service result does not return invoice or success",async()=>{
 for(const result of [null,{}, {replayed:true,invoice:{status:"issued"}}]){
  const f=fixture({create:async()=>result});
  const res=await f.handler.handle(request());
  assert.equal(res.status,503);assert.equal((await res.json()).ok,false);
 }
});

test("guarded draft cannot claim success for wrong-tenant or wrong-quote repository result",async()=>{
 const results=[
  {id:"draftA",tenantId:"tenantB",sourceQuotationId:"quoteA",status:"draft",invoiceReference:"ED-1"},
  {id:"draftA",tenantId:"tenantA",sourceQuotationId:"quoteB",status:"draft",invoiceReference:"ED-1"},
  {id:"draftA",tenantId:"tenantA",sourceQuotationId:"quoteA",status:"issued",invoiceReference:"ED-1"},
  {id:"draftA",tenantId:"tenantA",sourceQuotationId:"quoteA",status:"draft",invoiceReference:"ED 1"},
  {id:null,tenantId:"tenantA",sourceQuotationId:"quoteA",status:"draft",invoiceReference:"ED-1"}
 ];
 for(const invoice of results){
  const f=fixture({create:async()=>({replayed:false,invoice})});
  const res=await f.handler.handle(request());
  assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{ok:false,error:"draft_creation_unavailable"});
  assert.equal(f.stats().writes,1);
 }
});
test("guarded idempotent replay also rejects a mismatched tenant or quote",async()=>{
 for(const patch of [{tenantId:"tenantB"},{sourceQuotationId:"quoteB"}]){
  const invoice={id:"old",tenantId:"tenantA",sourceQuotationId:"quoteA",
   status:"draft",invoiceReference:"ED-original",...patch};
  const f=fixture({create:async()=>({replayed:true,invoice})});
  assert.equal((await f.handler.handle(request())).status,503);
 }
});
