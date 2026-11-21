import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createEssentialsPrivateCustomerQuotationReviewBoundary as create} from
 "../server/essentials-private-customer-quotation-review-boundary.mjs";

const origin="https://private-customer.example.test",at=Date.parse("2026-11-19T21:00:00Z");
const cookie="C".repeat(43),csrf="S".repeat(43);
const employeeCookie="__Host-thebe-consent="+"E".repeat(43);
const hash=async data=>[...new Uint8Array(await webcrypto.subtle.digest(
 "SHA-256",typeof data==="string"?new TextEncoder().encode(data):data))].
 map(n=>n.toString(16).padStart(2,"0")).join("");
const sessionHash=await hash(cookie),csrfHash=await hash(csrf);
const quoteBytes=new TextEncoder().encode("Q-101 Customer A exactly BWP 100.00");
const termsBytes=new TextEncoder().encode("Full, fixed contractual terms including cancellation and refund");
const quoteHash=await hash(quoteBytes),termsHash=await hash(termsBytes);
const quotationId="quoteA";
const baseQuote={
 state:"accepted",tenantId:"tenantA",customerId:"customerA",quotationId,
 quotationReference:"Q-101",quotationSha256:quoteHash,termsSha256:termsHash,
 acceptanceVersion:2,totalMinor:10000,
 immutableQuotationBytes:quoteBytes,immutableTermsBytes:termsBytes
};
const session={
 role:"customer",state:"active",tenantId:"tenantA",customerId:"customerA",
 quotationId,invitationId:"inviteA",customerIdentityLinkId:"linkA",
 csrfSha256:csrfHash,expiresAtMs:at+120000
};
const validAccept={
 presentationId:"offerA",decision:"accept",explicitlyAccepted:true,
 confirmedQuotationSha256:quoteHash,confirmedTermsSha256:termsHash,
 acceptanceVersion:2,confirmedTotalMinor:10000
};
const post=(change={})=>{
 const headers={
  cookie:"__Host-thebe-customer="+cookie,
  origin,"sec-fetch-site":"same-origin","content-type":"application/json",
  "x-csrf-token":csrf,...change.headers
 };
 return new Request(change.url??origin+"/private/customer/quotations/quoteA/accept",{
  method:change.method??"POST",headers,
  body:change.body===undefined?JSON.stringify(validAccept):change.body
 });
};
const get=(change={})=>new Request(
 change.url??origin+"/private/customer/quotations/quoteA/review",{
 method:"GET",headers:{cookie:"__Host-thebe-customer="+cookie,
  ...change.headers}
});
function harness({liveSession=true,liveQuote=true,allowPost=true,
 presentation=true,offerPatch={},now=()=>at}={}){
 const calls={sessions:[],quotes:[],offers:[],loads:[],authorizations:[]};
 let current={...session},frozen={...baseQuote},proof=null;
 const service=create({
  enabled:true,environment:"essentials-private-staging",
  expectedOrigin:origin,cryptoSubtle:webcrypto.subtle,now,
  loadActiveCustomerSession:async ({sessionKeyHash:sh})=>{
   calls.sessions.push(sh);
   return liveSession&&sh===sessionHash?current:null;
  },
  loadFrozenCustomerQuote:async x=>{
   calls.quotes.push(x);return liveQuote?frozen:null;
  },
  recordCustomerReviewOffered:async p=>{
   calls.offers.push(p);
   if(!presentation)return null;
   proof={...p,state:"offered",presentationId:"offerA",...offerPatch};
   return proof;
  },
  loadCustomerReviewOffered:async p=>{
   calls.loads.push(p);return presentation?proof:null;
  },
  authorizeCustomerAcceptancePost:async p=>{
   calls.authorizations.push(p);return allowPost;
  }
 });
 return {service,calls,changeSession:x=>{current={...current,...x}},
  changeQuote:x=>{frozen={...frozen,...x}},
  changeOffer:x=>{proof={...proof,...x}}};
}
const rejects=async f=>assert.rejects(f(),/private_customer_quote_acceptance_unverified/);

test("customer review and acceptance are private and disabled by default",()=>{
 assert.throws(()=>create(),/private_customer_quote_acceptance_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_customer_quote_acceptance_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging",
  expectedOrigin:origin}),/private_customer_quote_acceptance_unconfigured/);
});
test("customer-only authenticated GET offers EXACT quote AND full contract terms",async()=>{
 const h=harness();
 const review=await h.service.prepareCustomerReview({
  request:get(),quotationId
 });
 assert.equal(review.presentationId,"offerA");
 assert.equal(review.quotationId,"quoteA");
 assert.equal(review.quotationSha256,quoteHash);
 assert.equal(review.termsSha256,termsHash);
 assert.equal(review.totalMinor,10000);
 assert.deepEqual(review.immutableQuotationBytes,quoteBytes);
 assert.deepEqual(review.immutableTermsBytes,termsBytes);
 assert.notStrictEqual(review.immutableQuotationBytes,quoteBytes);
 assert.deepEqual(h.calls.quotes[0],{
  tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA"
 });
 assert.equal(h.calls.offers[0].sessionKeyHash,sessionHash);
 assert.equal(JSON.stringify(h.calls.offers).includes(cookie),false);
 assert.equal(JSON.stringify(h.calls.offers).includes(csrf),false);
});
test("customer cannot accept before getting full current frozen quote and server offer",async()=>{
 const h=harness();
 await rejects(()=>h.service.validateExplicitCustomerAcceptance({
  request:post(),quotationId
 }));
 assert.equal(h.calls.authorizations.length,0);
 await h.service.prepareCustomerReview({request:get(),quotationId});
 const validated=await h.service.validateExplicitCustomerAcceptance({
  request:post(),quotationId
 });
 assert.deepEqual(validated,{
  role:"customer",tenantId:"tenantA",customerId:"customerA",
  quotationId:"quoteA",customerIdentityLinkId:"linkA",
  sessionKeyHash:sessionHash,presentationId:"offerA",
  confirmedQuoteSha256:quoteHash,confirmedTermsSha256:termsHash,
  confirmedTotalMinor:10000,confirmedAcceptanceVersion:2,
  decision:"accept",explicitlyAccepted:true
 });
 assert.equal("idToken" in validated,false);
 assert.equal("actorUserId" in validated,false);
 assert.equal(h.calls.authorizations.length,1);
});
test("employee-only cookie, duplicate customer cookies, wrong scope and CSRF reject",async()=>{
 const h=harness();
 for(const request of [
  get({headers:{cookie:employeeCookie}}),
  get({headers:{cookie:"__Host-thebe-customer="+cookie+
    "; __Host-thebe-customer="+cookie}}),
  get({url:origin+"/private/customer/quotations/quoteB/review"}),
  get({url:origin+"/private/customer/quotations/quoteA/review?nonce=x"})
 ]){
  await rejects(()=>h.service.prepareCustomerReview({request,quotationId}));
 }
 await h.service.prepareCustomerReview({request:get(),quotationId});
 for(const request of [
  post({headers:{cookie:employeeCookie}}),
  post({headers:{"x-csrf-token":"bad"}}),
  post({headers:{"origin":"https://evil.test"}}),
  post({headers:{"sec-fetch-site":"cross-site"}}),
  post({url:origin+"/private/customer/quotations/quoteA/accept?token=evil"}),
  post({headers:{"content-type":"text/plain"}}),
  post({headers:{cookie:"__Host-thebe-customer="+cookie+
    "; __Host-thebe-customer="+cookie}})
 ]){
  await rejects(()=>h.service.validateExplicitCustomerAcceptance({
   request,quotationId
  }));
 }
 assert.equal(h.calls.authorizations.length,0);
});
test("rejection, missing checkbox, mutated terms/total/version, forbidden body keys fail",async()=>{
 const h=harness();await h.service.prepareCustomerReview({request:get(),quotationId});
 const variants=[
  {...validAccept,decision:"reject"},
  {...validAccept,explicitlyAccepted:false},
  {...validAccept,confirmedQuotationSha256:"f".repeat(64)},
  {...validAccept,confirmedTermsSha256:"f".repeat(64)},
  {...validAccept,confirmedTotalMinor:11000},
  {...validAccept,acceptanceVersion:3},
  {...validAccept,presentationId:"other"},
  {...validAccept,actorUserId:"employeeA"},
  {...validAccept,idToken:"forbidden"},
  {...validAccept,termsAccepted:"yes"}
 ];
 for(const variant of variants)
  await rejects(()=>h.service.validateExplicitCustomerAcceptance({
   request:post({body:JSON.stringify(variant)}),quotationId
  }));
 assert.equal(h.calls.authorizations.length,0);
});
test("tampered current quote, revoked customer, stale proof, wrong customer and expired session deny",async()=>{
 for(const patch of [
  {immutableQuotationBytes:new Uint8Array([1,2])},
  {immutableTermsBytes:new Uint8Array([3,4])},
  {state:"revoked"},{customerId:"customerB"},
  {acceptanceVersion:3},{totalMinor:20000}
 ]){
  const h=harness();await h.service.prepareCustomerReview({request:get(),quotationId});
  h.changeQuote(patch);
  await rejects(()=>h.service.validateExplicitCustomerAcceptance({
   request:post(),quotationId
  }));
 }
 const h=harness();await h.service.prepareCustomerReview({request:get(),quotationId});
 h.changeOffer({tenantId:"tenantB"});
 await rejects(()=>h.service.validateExplicitCustomerAcceptance({
  request:post(),quotationId
 }));
 const j=harness();await j.service.prepareCustomerReview({request:get(),quotationId});
 j.changeSession({state:"revoked"});
 await rejects(()=>j.service.validateExplicitCustomerAcceptance({
  request:post(),quotationId
 }));
 const k=harness();await k.service.prepareCustomerReview({request:get(),quotationId});
 k.changeSession({expiresAtMs:at});
 await rejects(()=>k.service.validateExplicitCustomerAcceptance({
  request:post(),quotationId
 }));
});
test("rejected independent acceptance authorization and oversized body deny",async()=>{
 const h=harness({allowPost:false});
 await h.service.prepareCustomerReview({request:get(),quotationId});
 await rejects(()=>h.service.validateExplicitCustomerAcceptance({
  request:post(),quotationId
 }));
 assert.equal(h.calls.authorizations.length,1);
 const tooBig=JSON.stringify({...validAccept,filler:"x".repeat(3000)});
 await rejects(()=>h.service.validateExplicitCustomerAcceptance({
  request:post({body:tooBig}),quotationId
 }));
});

test("customer GET denies stale, future and inconsistent persisted offer issue times",async()=>{
 for(const offerPatch of [
  {issuedAtMs:at-1},
  {issuedAtMs:at+1},
  {issuedAtMs:undefined},
  {issuedAtMs:at-600000,expiresAtMs:at+60000},
  {issuedAtMs:at,expiresAtMs:at+300001}
 ]){
  const h=harness({offerPatch});
  await rejects(()=>h.service.prepareCustomerReview({
   request:get(),quotationId
  }));
  assert.equal(h.calls.authorizations.length,0);
 }
 const h=harness();
 const review=await h.service.prepareCustomerReview({
  request:get(),quotationId
 });
 assert.equal(review.expiresAtMs,at+120000);
});
