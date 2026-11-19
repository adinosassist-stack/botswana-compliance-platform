import test from "node:test";
import assert from "node:assert/strict";
import {
 createEssentialsPrivateConsentAuthorityStore,
 ESSENTIALS_PRIVATE_COMMIT_RECEIPT_SQL,
 ESSENTIALS_PRIVATE_CURRENT_RECEIPT_SQL
} from "../server/essentials-private-consent-authority-store.mjs";
const H_Q="a".repeat(64), H_C="b".repeat(64);
const payload={
 acceptanceVersion:2,acceptedAt:"2026-11-19T09:00:00Z",
 acceptedByUserId:"actorA",consentSha256:H_C,customerId:"customerA",
 expiresAt:"2026-11-19T09:10:00Z",issuedAt:"2026-11-19T09:05:00Z",
 issuer:"thebe-private-quotation-consent-staging",
 purpose:"thebe.essentials.quotation-acceptance.v1",
 quotationId:"quoteA",quotationReference:"Q-101",
 quotationSha256:H_Q,receiptId:"receiptA",tenantId:"tenantA",totalMinor:10000
};
const receipt={payload,signature:"A".repeat(86)};
const params={tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA",
 receipt,expectedQuotationSha256:H_Q,expectedConsentSha256:H_C};
function harness({changes=1,row=null,failWrite=false,failRead=false}={}){
 const calls=[];
 const db={prepare:sql=>{
  calls.push({sql,params:[]});
  const call=calls[calls.length-1];
  return {bind:(...values)=>{
   call.params=values;
   return {
    async run(){if(failWrite)throw Error("D1 failure");return {success:true,meta:{changes}}},
    async first(){if(failRead)throw Error("D1 failure");return row}
   };
  }};
 }};
 const store=createEssentialsPrivateConsentAuthorityStore({
  enabled:true,environment:"essentials-private-staging",db
 });
 return {store,stats:()=>calls};
}
test("staging authority is disabled by default and requires D1",()=>{
 assert.throws(()=>createEssentialsPrivateConsentAuthorityStore(),/acceptance_authority_disabled/);
 assert.throws(()=>createEssentialsPrivateConsentAuthorityStore({
  enabled:true,environment:"essentials-private-staging"
 }),/acceptance_authority_unconfigured/);
});
test("guarded commit binds exact quote, actor, receipt and consent fingerprint in one INSERT SELECT",async()=>{
 const h=harness();assert.equal(await h.store.commitImmutableReceipt(params),true);
 assert.equal(h.stats().length,1);
 const call=h.stats()[0];
 assert.equal(call.sql,ESSENTIALS_PRIVATE_COMMIT_RECEIPT_SQL);
 assert.match(call.sql,/JOIN essentials_private_verified_consents AS c/);
 assert.match(call.sql,/q.state='accepted' AND c.state='accepted'/);
 assert.equal(call.params.length,16);
 assert.deepEqual(call.params.slice(0,6),[
  "receiptA","actorA",JSON.stringify(payload),receipt.signature,
  payload.issuedAt,payload.expiresAt
 ]);
 assert.deepEqual(call.params.slice(6),[
  "tenantA","quoteA","customerA","Q-101",2,10000,H_Q,H_C,"actorA",
  payload.acceptedAt
 ]);
});
test("untrusted receipt fields and actor never reach database writes",async()=>{
 for(const other of [
  {...params,tenantId:"bad/id"},
  {...params,actorUserId:"other"},
  {...params,expectedQuotationSha256:"c".repeat(64)},
  {...params,expectedConsentSha256:"d".repeat(64)},
  {...params,receipt:{...receipt,signature:"invalid"}},
  {...params,receipt:{...receipt,payload:{...payload,totalMinor:-1}}},
  {...params,receipt:{...receipt,payload:{...payload,issuer:"unrelated"}}},
  {...params,receipt:{...receipt,payload:{...payload,expiresAt:"2026-11-20T09:10:00Z"}}}
 ]){
  const h=harness();
  await assert.rejects(h.store.commitImmutableReceipt(other),/acceptance_authority_unverified/);
  assert.equal(h.stats().length,0);
 }
});
test("revoked quote, revoked consent, race and D1 outage never report commit success",async()=>{
 for(const opts of [{changes:0},{failWrite:true}]){
  const h=harness(opts);
  await assert.rejects(h.store.commitImmutableReceipt(params),/acceptance_authority_unverified/);
 }
});
test("read side uses same-D1 joined eligibility and returns only server-side receipt",async()=>{
 const h=harness({row:{receipt_id:"receiptA",
  receipt_payload_json:JSON.stringify(payload),signature:receipt.signature}});
 const result=await h.store.loadServerSideReceipt({
  tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA"
 });
 assert.deepEqual(result,receipt);
 assert.equal(h.stats()[0].sql,ESSENTIALS_PRIVATE_CURRENT_RECEIPT_SQL);
 assert.deepEqual(h.stats()[0].params,["tenantA","quoteA","actorA"]);
 assert.match(h.stats()[0].sql,/r.state='issued' AND q.state='accepted' AND c.state='accepted'/);
});
test("revoked, stale or unavailable read returns no evidence",async()=>{
 const h=harness();
 assert.equal(await h.store.loadServerSideReceipt({
  tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA"
 }),null);
 const f=harness({failRead:true});
 await assert.rejects(f.store.loadServerSideReceipt({
  tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA"
 }),/acceptance_authority_unverified/);
});
test("current-authority callback checks all receipt-linked money and digest fields",async()=>{
 const h=harness({row:{receipt_id:"receiptA",
  receipt_payload_json:JSON.stringify(payload),signature:receipt.signature}});
 const input={tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA",
  receiptId:"receiptA",acceptanceVersion:2,customerId:"customerA",
  quotationReference:"Q-101",totalMinor:10000,
  quotationSha256:H_Q,consentSha256:H_C};
 assert.equal(await h.store.verifyCurrentAuthorityReceipt(input),true);
 for(const item of [
  {...input,receiptId:"other"},{...input,totalMinor:1},
  {...input,customerId:"other"},{...input,acceptanceVersion:3},
  {...input,quotationSha256:"c".repeat(64)},
  {...input,consentSha256:"c".repeat(64)}
 ]){
  assert.equal(await h.store.verifyCurrentAuthorityReceipt(item),false);
 }
 assert.equal(await harness().store.verifyCurrentAuthorityReceipt(input),false);
 assert.equal(await harness({failRead:true}).store.verifyCurrentAuthorityReceipt(input),false);
});
