import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateFrozenTermsReviewStore as create,
 ESSENTIALS_PRIVATE_FREEZE_QUOTE_WITH_TERMS_SQL as FREEZE,
 ESSENTIALS_PRIVATE_BIND_IMMUTABLE_TERMS_SQL as TERMS,
 ESSENTIALS_PRIVATE_ASSERT_FROZEN_TERMS_SQL as ASSERT,
 ESSENTIALS_PRIVATE_READ_CUSTOMER_FROZEN_TERMS_SQL as READ_QUOTE,
 ESSENTIALS_PRIVATE_INSERT_CUSTOMER_REVIEW_OFFER_SQL as OFFER,
 ESSENTIALS_PRIVATE_READ_CUSTOMER_REVIEW_OFFER_SQL as READ_OFFER
} from "../server/essentials-private-frozen-terms-review-store.mjs";
import {createEssentialsPrivateCustomerQuotationReviewBoundary} from
 "../server/essentials-private-customer-quotation-review-boundary.mjs";

const at=Date.parse("2026-11-19T21:00:00Z"),origin="https://customer.private.test";
const te=new TextEncoder(),qBytes=te.encode("Q-101 exact BWP100.00 frozen"),
 termsBytes=te.encode("The complete contract: refund, cancellation and installer terms.");
const source={
 tenantId:"tenantA",quotationId:"quoteA",customerId:"customerA",
 quotationReference:"Q-101",acceptanceVersion:2,totalMinor:10000,
 frozenByActorUserId:"actorA",immutableQuotationBytes:qBytes,
 immutableTermsBytes:termsBytes
};
const scope={tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA"};
const sessionKeyHash="a".repeat(64);
const session={role:"customer",state:"active",...scope,invitationId:"inviteA",
 customerIdentityLinkId:"linkA",expiresAtMs:at+120000};
function harness({allowFreeze=true,allowReview=true,active=true,zeroWrites=false}={}){
 const state={quotes:null,terms:null,offer:null,authorizations:[],
  queries:[],batches:[],active};
 let entropy=0;
 const db={prepare(sql){return {bind(...args){
  state.queries.push({sql,args});
  return {
   async first(){
    if(sql===READ_QUOTE){
     if(!state.quotes||!state.terms)return null;
     const q=state.quotes,t=state.terms;
     if(args[0]!==q.tenant_id||args[1]!==q.customer_id||
      args[2]!==q.quotation_id||q.state!=="accepted")return null;
     return {...q,...t,immutable_quotation_bytes:q.immutable_quotation_bytes,
      quotation_sha256:q.quotation_sha256};
    }
    if(sql===READ_OFFER){
     if(!state.offer||state.offer.state!=="offered"||
       state.offer.presentation_id!==args[0]||
       state.offer.session_key_sha256!==args[1]||
       state.offer.tenant_id!==args[2]||
       state.offer.customer_id!==args[3]||
       state.offer.quotation_id!==args[4]||
       state.offer.expires_at_ms<=args[6]||
       !state.active)return null;
     return {...state.offer};
    }
    throw Error("unknown query");
   },
   async run(){
    if(sql!==OFFER||zeroWrites||state.offer)return {success:true,meta:{changes:0}};
    const [presentationId,issuedAtMs,expiresAtMs,sh,tenantId,customerId,quotationId,
     exp,quoteHash,termsHash,version,total]=args;
    if(!state.quotes||!state.terms||!state.active||
      quoteHash!==state.quotes.quotation_sha256||
      termsHash!==state.terms.terms_sha256||
      exp!==expiresAtMs||version!==state.quotes.acceptance_version||
      total!==state.quotes.total_minor)return {success:true,meta:{changes:0}};
    state.offer={presentation_id:presentationId,session_key_sha256:sh,
      tenant_id:tenantId,customer_id:customerId,quotation_id:quotationId,
      customer_identity_link_id:"linkA",quotation_sha256:quoteHash,
      terms_sha256:termsHash,acceptance_version:version,total_minor:total,
      issued_at_ms:issuedAtMs,expires_at_ms:expiresAtMs,state:"offered"};
    return {success:true,meta:{changes:1}};
   }
  };
 }};},
 async batch(items){
  state.batches.push(items);
  if(items.length!==3||items[0].sql!==FREEZE||
    items[1].sql!==TERMS||items[2].sql!==ASSERT||
    zeroWrites||state.quotes)throw Error("transaction denied");
  const q=items[0].args,t=items[1].args;
  state.quotes={tenant_id:q[0],quotation_id:q[1],
   customer_id:q[2],quotation_reference:q[3],
   acceptance_version:q[4],total_minor:q[5],
   quotation_sha256:q[6],immutable_quotation_bytes:q[7],
   frozen_at:q[9],state:"accepted"};
  state.terms={terms_sha256:t[0],immutable_terms_bytes:t[1]};
  return items.map(()=>({success:true,meta:{changes:1}}));
 }};
 const store=create({
  enabled:true,environment:"essentials-private-staging",db,
  randomBytes:n=>new Uint8Array(n).fill(++entropy),
  now:()=>at,cryptoSubtle:webcrypto.subtle,
  authorizeAuthoritativeFreeze:async p=>{
   state.authorizations.push({type:"freeze",p});
   return allowFreeze;
  },
  loadActiveCustomerSession:async ({sessionKeyHash:sh})=>
   sh===sessionKeyHash&&state.active?{...session}:null,
  authorizeCustomerReviewOffer:async p=>{
   state.authorizations.push({type:"offer",p});return allowReview;
  }
 });
 return {store,state};
}
const deny=fn=>assert.rejects(fn(),/private_frozen_terms_review_unverified/);
async function frozen(h){
 return h.store.freezeQuotationWithTerms({source});
}
test("source-only frozen terms/review cannot run without staging and independent authorities",()=>{
 assert.throws(()=>create(),/private_frozen_terms_review_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_frozen_terms_review_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_frozen_terms_review_unconfigured/);
});
test("frozen quote and COMPLETE immutable contract are committed in exactly ONE guarded D1 batch",async()=>{
 const h=harness(),result=await frozen(h);
 assert.equal(result.state,"frozen-with-terms");
 assert.match(result.quotationSha256,/^[a-f0-9]{64}$/);
 assert.match(result.termsSha256,/^[a-f0-9]{64}$/);
 assert.notEqual(result.quotationSha256,result.termsSha256);
 assert.deepEqual(h.state.batches[0].map(x=>x.sql),[FREEZE,TERMS,ASSERT]);
 assert.deepEqual(h.state.batches[0][0].args.slice(0,6),
  ["tenantA","quoteA","customerA","Q-101",2,10000]);
 assert.deepEqual(h.state.batches[0][0].args[7],[...qBytes]);
 assert.deepEqual(h.state.batches[0][1].args.slice(0,2),
  [result.termsSha256,[...termsBytes]]);
 assert.equal(h.state.batches[0][2].args[2],result.quotationSha256);
 assert.equal(h.state.authorizations[0].p.immutableTermsBytes instanceof Uint8Array,true);
 await deny(()=>frozen(h)); // duplicate quota, cannot replace contract
});
test("immutable join reader returns both digests and separate cloned byte snapshots",async()=>{
 const h=harness();await frozen(h);
 const q=await h.store.loadFrozenCustomerQuote(scope);
 assert.equal(q.state,"accepted");
 assert.deepEqual(q.immutableQuotationBytes,qBytes);
 assert.deepEqual(q.immutableTermsBytes,termsBytes);
 assert.notStrictEqual(q.immutableTermsBytes,termsBytes);
 assert.equal(await h.store.loadFrozenCustomerQuote({
  ...scope,customerId:"customerB"}),null);
 h.state.terms.immutable_terms_bytes[0]^=1;
 await deny(()=>h.store.loadFrozenCustomerQuote(scope));
});
test("no authorized freeze, failed D1 or altered input can create a completed quote",async()=>{
 for(const opts of [{allowFreeze:false},{zeroWrites:true}]){
  const h=harness(opts);await deny(()=>frozen(h));
  assert.equal(h.state.quotes,null);
 }
 for(const bad of [
  {...source,immutableTermsBytes:new Uint8Array()},
  {...source,totalMinor:-1},{...source,customerId:"customer/evil"},
  {...source,acceptanceVersion:0}
 ]){
  const h=harness();await deny(()=>h.store.freezeQuotationWithTerms({source:bad}));
  assert.equal(h.state.batches.length,0);
 }
});
test("review offer is bound to active authenticated CUSTOMER session and exact terms",async()=>{
 const h=harness();const result=await frozen(h);
 const args={sessionKeyHash,...scope,issuedAtMs:at,
  expiresAtMs:at+60000,quotationSha256:result.quotationSha256,
  termsSha256:result.termsSha256,acceptanceVersion:2,totalMinor:10000};
 const offer=await h.store.recordCustomerReviewOffered(args);
 assert.equal(offer.state,"offered");
 assert.match(offer.presentationId,/^[A-Za-z0-9_-]{32}$/);
 const stored=await h.store.loadCustomerReviewOffered({
  presentationId:offer.presentationId,sessionKeyHash,...scope
 });
 assert.deepEqual(stored,offer);
 assert.equal(JSON.stringify(h.state.queries).includes("C".repeat(43)),false);
 assert.equal(h.state.authorizations.at(-1).type,"offer");
 await deny(()=>h.store.recordCustomerReviewOffered({
  ...args,termsSha256:"f".repeat(64)
 }));
 await deny(()=>h.store.recordCustomerReviewOffered({
  ...args,sessionKeyHash:"b".repeat(64)
 }));
 h.state.active=false;
 await deny(()=>h.store.loadCustomerReviewOffered({
  presentationId:offer.presentationId,sessionKeyHash,...scope
 }));
});
test("wrong customer, missing parent freeze, withdrawn grant or expiry deny offers",async()=>{
 const qh=harness();await frozen(qh);
 const input={sessionKeyHash,...scope,issuedAtMs:at,
  expiresAtMs:at+60000,quotationSha256:qh.state.quotes.quotation_sha256,
  termsSha256:qh.state.terms.terms_sha256,acceptanceVersion:2,totalMinor:10000};
 await deny(()=>qh.store.recordCustomerReviewOffered({
  ...input,customerId:"customerB"
 }));
 await deny(()=>qh.store.recordCustomerReviewOffered({
  ...input,expiresAtMs:at+300000
 }));
 await deny(()=>qh.store.recordCustomerReviewOffered({
  ...input,acceptanceVersion:3
 }));
 const noGrant=harness({allowReview:false});await frozen(noGrant);
 await deny(()=>noGrant.store.recordCustomerReviewOffered(input));
 const noFreeze=harness();
 await deny(()=>noFreeze.store.recordCustomerReviewOffered(input));
});
test("current review/terms store wires directly to merged customer GET/POST boundary",async()=>{
 const h=harness();await frozen(h);
 const customerCookie="C".repeat(43),csrfToken="S".repeat(43);
 const hash=async v=>[...new Uint8Array(await webcrypto.subtle.digest(
  "SHA-256",te.encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");
 // The store uses the actual cookie hash; the test fixture must mirror it.
 const liveHash=await hash(customerCookie),csrfHash=await hash(csrfToken);
 const h2=harness();await frozen(h2);
 // Directly exercise the existing boundary with an isolated host-scoped
 // adapter that maps the current authenticated customer cookie to test store.
 const boundary=createEssentialsPrivateCustomerQuotationReviewBoundary({
  enabled:true,environment:"essentials-private-staging",
  expectedOrigin:origin,now:()=>at,cryptoSubtle:webcrypto.subtle,
  loadActiveCustomerSession:async({sessionKeyHash:sh})=>
   sh===liveHash?{...session,csrfSha256:csrfHash}:null,
  loadFrozenCustomerQuote:h2.store.loadFrozenCustomerQuote,
  recordCustomerReviewOffered:async input=>{
   // Test adapter translates only the synthetic host's exact cookie digest.
   // No browser principal is supplied to the source service.
   if(input.sessionKeyHash!==liveHash)throw Error("bad cookie");
   return h2.store.recordCustomerReviewOffered({
    ...input,sessionKeyHash
   }).then(x=>({...x,sessionKeyHash:liveHash}));
  },
  loadCustomerReviewOffered:async input=>{
   if(input.sessionKeyHash!==liveHash)throw Error("bad cookie");
   return h2.store.loadCustomerReviewOffered({
    ...input,sessionKeyHash
   }).then(x=>x&&({...x,sessionKeyHash:liveHash}));
  },
  authorizeCustomerAcceptancePost:async()=>true
 });
 const get=new Request(origin+"/private/customer/quotations/quoteA/review",{
  method:"GET",headers:{cookie:"__Host-thebe-customer="+customerCookie}
 });
 const display=await boundary.prepareCustomerReview({request:get,quotationId:"quoteA"});
 assert.equal(display.totalMinor,10000);
 const post=new Request(origin+"/private/customer/quotations/quoteA/accept",{
  method:"POST",headers:{
   cookie:"__Host-thebe-customer="+customerCookie,origin,
   "sec-fetch-site":"same-origin","content-type":"application/json",
   "x-csrf-token":csrfToken
  },
  body:JSON.stringify({
   presentationId:display.presentationId,decision:"accept",
   explicitlyAccepted:true,confirmedQuotationSha256:display.quotationSha256,
   confirmedTermsSha256:display.termsSha256,
   confirmedTotalMinor:10000,acceptanceVersion:2
  })
 });
 const checked=await boundary.validateExplicitCustomerAcceptance({
  request:post,quotationId:"quoteA"
 });
 assert.equal(checked.role,"customer");
 assert.equal(checked.confirmedTermsSha256,display.termsSha256);
});
