import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createC4AuthoritativeQuotationPublicationBridge as createBridge,
 C4_QUOTATION_PUBLICATION_CONTRACT as contract
} from "../server/essentials-private-business-quotation-publication-bridge.mjs";
import {createEssentialsPrivateFrozenTermsReviewStore,
 ESSENTIALS_PRIVATE_FREEZE_QUOTE_WITH_TERMS_SQL as FREEZE,
 ESSENTIALS_PRIVATE_BIND_IMMUTABLE_TERMS_SQL as TERMS,
 ESSENTIALS_PRIVATE_ASSERT_FROZEN_TERMS_SQL as AUDIT
} from "../server/essentials-private-frozen-terms-review-store.mjs";
const te=new TextEncoder(),subtle=webcrypto.subtle;
const quoteBytes=te.encode("Approved issued quotation Q-202 BWP 1250.00");
const termsBytes=te.encode("Complete binding terms including refunds, cancellation and exclusions");
const h=async x=>[...new Uint8Array(await subtle.digest("SHA-256",x))]
 .map(v=>v.toString(16).padStart(2,"0")).join("");
const ids={tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA"};
const principal={
 authenticated:true,sessionVerified:true,csrfVerified:true,
 role:"owner",tenantId:"tenantA",userId:"ownerA",
 permissions:["quotation:issue:approved"]
};
async function setup({
 owner={...principal},customer={},quote={},allowed=true,current=true,
 failRead=false,failFreeze=false,receiptChanges={}
}={}){
 const hashes={quotationSha256:await h(quoteBytes),termsSha256:await h(termsBytes)};
 const baseCustomer={tenantId:"tenantA",customerId:"customerA",
  state:"active",revoked:false,deleted:false,authoritativeSource:true,...customer};
 const baseQuote={...ids,quotationReference:"Q-202",state:"approved-for-issuance",
  current:true,revoked:false,sourceVerified:true,
  acceptanceVersion:2,totalMinor:125000,approvalEvidenceId:"approvalA",
  completeApprovedTerms:true,
  immutableQuotationBytes:quoteBytes,immutableTermsBytes:termsBytes,...hashes,...quote};
 const activity={customer:0,quote:0,permission:0,current:0,freeze:0,sources:[]};
 const store={async freezeQuotationWithTerms({source}){
  activity.freeze++;activity.sources.push(source);
  if(failFreeze)throw Error("backend error");
  return {state:"frozen-with-terms",
   tenantId:source.tenantId,customerId:source.customerId,
   quotationId:source.quotationId,quotationSha256:hashes.quotationSha256,
   termsSha256:hashes.termsSha256,acceptanceVersion:source.acceptanceVersion,
   totalMinor:source.totalMinor,...receiptChanges};
 }};
 const service=createBridge({
  enabled:true,environment:"essentials-private-staging",
  loadActiveBusinessCustomer:async()=>{activity.customer++;if(failRead)throw Error("unavailable");return baseCustomer},
  loadApprovedBusinessQuotation:async()=>{activity.quote++;if(failRead)throw Error("unavailable");return baseQuote},
  authorizeBusinessPublication:async()=>{activity.permission++;return allowed},
  verifyCurrentApprovalAtFreeze:async()=>{activity.current++;return current},
  frozenTermsStore:store,cryptoSubtle:subtle
 });
 return {service,activity,baseQuote,hashes,owner};
}
const denied=f=>assert.rejects(f(),/c4_business_quotation_publication_denied/);
test("publication bridge is default-disabled, staging-only and cannot serve a customer route",()=>{
 assert.throws(()=>createBridge(),/publication_disabled/);
 assert.throws(()=>createBridge({enabled:true,environment:"production"}),/publication_disabled/);
 assert.throws(()=>createBridge({enabled:true,environment:"essentials-private-staging"}),/publication_unconfigured/);
 assert.equal(contract.sourceOfTruthAdapterProvisioned,false);
 assert.equal(contract.publicHttpRouteEnabled,false);
 assert.equal(contract.productionDatabaseDirectBindingAllowed,false);
 assert.equal(contract.acceptsBrowserDraftAsSource,false);
 assert.equal(contract.customerLoginEnabled,false);
 assert.equal(contract.cloudWriteAuthorized,false);
});
test("authorized business owner publishes source-loaded quote+FULL terms into existing freeze store",async()=>{
 const f=await setup();
 const result=await f.service.publishApprovedQuotation({...ids,principal});
 assert.equal(result.state,"frozen-with-terms");
 assert.equal(result.quotationSha256,f.hashes.quotationSha256);
 assert.equal(result.termsSha256,f.hashes.termsSha256);
 assert.deepEqual([f.activity.customer,f.activity.quote,f.activity.permission,
  f.activity.current,f.activity.freeze],[1,1,1,1,1]);
 const source=f.activity.sources[0];
 assert.equal(source.frozenByActorUserId,"ownerA");
 assert.equal(source.quotationReference,"Q-202");
 assert.equal(source.acceptanceVersion,2);
 assert.equal(source.totalMinor,125000);
 assert.deepEqual(source.immutableQuotationBytes,quoteBytes);
 assert.deepEqual(source.immutableTermsBytes,termsBytes);
 assert.notStrictEqual(source.immutableQuotationBytes,quoteBytes);
 assert.notStrictEqual(source.immutableTermsBytes,termsBytes);
 assert.equal(result.customerLoginEnabled,false);
 assert.equal(result.invitationSent,false);
});
test("unauthenticated employee, unverified CSRF, browser-supplied tenant and absent issuance privilege DENY before source reads",async()=>{
 for(const actor of [
  null,{...principal,role:"employee"},{...principal,authenticated:false},
  {...principal,sessionVerified:false},{...principal,csrfVerified:false},
  {...principal,tenantId:"tenantB"},{...principal,userId:"owner/evil"},
  {...principal,permissions:[]},{...principal,permissions:null}
 ]){
  const f=await setup();
  await denied(()=>f.service.publishApprovedQuotation({...ids,principal:actor}));
  assert.equal(f.activity.customer,0);
  assert.equal(f.activity.freeze,0);
 }
 const f=await setup();
 await denied(()=>f.service.publishApprovedQuotation({...ids,principal,customerId:"customer/evil"}));
 assert.equal(f.activity.customer,0);
});
test("real source must return an active tenant-scoped customer AND an approved, current bound quote",async()=>{
 const samples=[
  {customer:{state:"archived"}},{customer:{tenantId:"tenantB"}},
  {customer:{revoked:true}},{customer:{deleted:true}},
  {customer:{authoritativeSource:false}},
  {quote:{state:"draft"}},{quote:{state:"void"}},
  {quote:{published:true,state:"issued"}},
  {quote:{customerId:"customerB"}},{quote:{tenantId:"tenantB"}},
  {quote:{quotationId:"quoteB"}},
  {quote:{sourceVerified:false}},{quote:{revoked:true}},
  {quote:{current:false}},{quote:{completeApprovedTerms:false}},
  {quote:{approvalEvidenceId:""}},
  {quote:{acceptanceVersion:0}},{quote:{totalMinor:-1}}
 ];
 for(const input of samples){
  const f=await setup(input);
  await denied(()=>f.service.publishApprovedQuotation({...ids,principal}));
  assert.equal(f.activity.freeze,0,JSON.stringify(input));
 }
});
test("tampered quotation/terms bytes and mismatching source digest DENY without freeze",async()=>{
 for(const diff of [
  {immutableQuotationBytes:te.encode("tampered")},
  {immutableTermsBytes:te.encode("incomplete")},
  {immutableTermsBytes:new Uint8Array()},
  {immutableQuotationBytes:"untrusted string"},
  {termsSha256:"a".repeat(64)},
  {quotationSha256:"f".repeat(64)}
 ]){
  const f=await setup({quote:diff});
  await denied(()=>f.service.publishApprovedQuotation({...ids,principal}));
  assert.equal(f.activity.freeze,0);
 }
});
test("business issue permission and current approval must both remain valid",async()=>{
 for(const options of [{allowed:false},{current:false},{failRead:true}]){
  const f=await setup(options);
  await denied(()=>f.service.publishApprovedQuotation({...ids,principal}));
  assert.equal(f.activity.freeze,0);
 }
});
test("underlying atomic freeze failure and stale or inconsistent receipt DENY",async()=>{
 for(const opts of [
  {failFreeze:true},{receiptChanges:{quotationSha256:"a".repeat(64)}},
  {receiptChanges:{state:"draft"}},{receiptChanges:{quotationId:"quoteB"}},
  {receiptChanges:{customerId:"customerB"}}
 ]){
  const f=await setup(opts);
  await denied(()=>f.service.publishApprovedQuotation({...ids,principal}));
 }
});
test("no ownership claims, invitation token, email or employee session are published",async()=>{
 const f=await setup();
 const result=await f.service.publishApprovedQuotation({...ids,principal});
 for(const key of ["email","phone","invitation","bearer","accessToken",
  "identitySubject","customerCookie"]){
  assert.equal(Object.hasOwn(result,key),false,key);
  assert.equal(Object.hasOwn(f.activity.sources[0],key),false,key);
 }
 assert.deepEqual(Object.keys(f.activity.sources[0]).sort(),
  ["tenantId","customerId","quotationId","quotationReference",
   "acceptanceVersion","totalMinor","frozenByActorUserId",
   "immutableQuotationBytes","immutableTermsBytes"].sort());
});

test("integrates with REAL existing frozen-terms store and performs one exact guarded three-statement batch",async()=>{
 const f=await setup();
 const batches=[],authorities=[];
 const db={
  prepare(sql){return{bind(...args){return{sql,args}}}},
  async batch(statements){
   batches.push(statements);
   return statements.map(()=>({success:true,meta:{changes:1}}));
  }
 };
 const freeze=createEssentialsPrivateFrozenTermsReviewStore({
  enabled:true,environment:"essentials-private-staging",
  db,now:()=>Date.parse("2026-11-20T19:00:00Z"),
  randomBytes:n=>new Uint8Array(n).fill(7),
  cryptoSubtle:subtle,
  authorizeAuthoritativeFreeze:async source=>{
   authorities.push(source);
   return source.tenantId==="tenantA"&&
    source.customerId==="customerA"&&
    source.quotationId==="quoteA"&&
    source.quotationSha256===f.hashes.quotationSha256&&
    source.termsSha256===f.hashes.termsSha256;
  },
  loadActiveCustomerSession:async()=>null,
  authorizeCustomerReviewOffer:async()=>false
 });
 const gate=createBridge({
  enabled:true,environment:"essentials-private-staging",
  cryptoSubtle:subtle,
  loadActiveBusinessCustomer:async()=>({
   tenantId:"tenantA",customerId:"customerA",state:"active",
   revoked:false,deleted:false,authoritativeSource:true
  }),
  loadApprovedBusinessQuotation:async()=>f.baseQuote,
  authorizeBusinessPublication:async()=>true,
  verifyCurrentApprovalAtFreeze:async()=>true,
  frozenTermsStore:freeze
 });
 const result=await gate.publishApprovedQuotation({...ids,principal});
 assert.equal(result.state,"frozen-with-terms");
 assert.equal(authorities.length,1);
 assert.equal(batches.length,1);
 assert.deepEqual(batches[0].map(x=>x.sql),[FREEZE,TERMS,AUDIT]);
 assert.deepEqual(batches[0].map(x=>x.args.slice(0,2)),[
  ["tenantA","quoteA"],[f.hashes.termsSha256,Array.from(termsBytes)],
  ["tenantA","quoteA"]
 ]);
});
