import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createEssentialsPrivateAcceptanceReceiptIssuer}
 from "../server/essentials-private-acceptance-receipt-issuer.mjs";
import {createEssentialsSignedAcceptanceVerifier}
 from "../server/essentials-private-signed-acceptance-verifier.mjs";

const subtle=webcrypto.subtle;
const keys=await subtle.generateKey("Ed25519",false,["sign","verify"]);
const encoder=new TextEncoder();
const quotationBytes=encoder.encode("FROZEN: tenantA/quoteA/Q-101 version 2 BWP100.00 customerA");
const consentBytes=encoder.encode("IMMUTABLE CONSENT: authenticated customerA accepted quoteA version 2");
const quoteSha=[...new Uint8Array(await subtle.digest("SHA-256",quotationBytes))]
 .map(b=>b.toString(16).padStart(2,"0")).join("");
const consentSha=[...new Uint8Array(await subtle.digest("SHA-256",consentBytes))]
 .map(b=>b.toString(16).padStart(2,"0")).join("");
const time=Date.parse("2026-11-19T09:05:00Z");
const principal={tenantId:"tenantA",userId:"actorA",permissions:["quotation:accept:record"]};
const quote={
 tenantId:"tenantA",quotationId:"quoteA",customerId:"customerA",
 quotationReference:"Q-101",state:"accepted",acceptanceVersion:2,
 totalMinor:10000,immutableQuotationBytes:quotationBytes
};
const consent={
 verified:true,state:"accepted",tenantId:"tenantA",quotationId:"quoteA",
 actorUserId:"actorA",customerId:"customerA",quotationReference:"Q-101",
 acceptanceVersion:2,totalMinor:10000,quotationSha256:quoteSha,
 acceptedAt:"2026-11-19T09:00:00Z",immutableConsentBytes:consentBytes
};
const args={principal,quotationId:"quoteA"};
function fixture({authorized=async()=>true,frozen=async()=>quote,
 verifiedConsent=async()=>consent,commit=async()=>true,clock=()=>time}={}){
 let count={authorization:0,quotation:0,consent:0,commit:0},persisted=null;
 const issuer=createEssentialsPrivateAcceptanceReceiptIssuer({
  enabled:true,environment:"essentials-private-staging",privateKey:keys.privateKey,
  cryptoSubtle:subtle,now:clock,randomUUID:()=>"receipt-1",
  verifyIssuerAuthorization:async data=>{count.authorization++;return authorized(data)},
  loadFrozenAcceptedQuotation:async data=>{count.quotation++;return frozen(data)},
  verifyRecordedCustomerConsent:async data=>{count.consent++;return verifiedConsent(data)},
  commitImmutableReceipt:async data=>{count.commit++;persisted=data;return commit(data)}
 });
 return {issuer,stats:()=>({count:{...count},persisted})};
}
test("issuer is unmounted/disabled by default; public key or missing authority callbacks refuse configuration",()=>{
 assert.throws(()=>createEssentialsPrivateAcceptanceReceiptIssuer(),/acceptance_issuer_disabled/);
 assert.throws(()=>createEssentialsPrivateAcceptanceReceiptIssuer({
  enabled:true,environment:"essentials-private-staging",privateKey:keys.publicKey
 }),/acceptance_issuer_unconfigured/);
});
test("private source-only receipt matches independent Ed25519 verifier canonical contract",async()=>{
 const h=fixture();const signed=await h.issuer.issue(args);
 assert.equal(signed.payload.quotationSha256,quoteSha);
 assert.equal(signed.payload.consentSha256,consentSha);
 assert.equal(signed.payload.totalMinor,10000);
 assert.equal(signed.payload.acceptedByUserId,"actorA");
 assert.equal(signed.payload.expiresAt,"2026-11-19T09:10:00Z");
 assert.match(signed.signature,/^[A-Za-z0-9_-]{86}$/);
 assert.deepEqual(h.stats().count,{authorization:1,quotation:1,consent:1,commit:1});
 assert.equal(h.stats().persisted.expectedConsentSha256,consentSha);
 assert.equal(h.stats().persisted.expectedQuotationSha256,quoteSha);
 const verifier=createEssentialsSignedAcceptanceVerifier({
  enabled:true,environment:"essentials-private-staging",
  publicKey:keys.publicKey,cryptoSubtle:subtle,now:()=>time+1000,
  loadServerSideReceipt:async()=>signed,
  verifyCurrentAuthorityReceipt:async fields=>{
   assert.equal(fields.quotationSha256,quoteSha);
   assert.equal(fields.consentSha256,consentSha);
   assert.equal(fields.receiptId,"receipt-1");
   return true;
  }
 });
 const verified=await verifier({tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA"});
 assert.equal(verified.verified,true);
 assert.equal(verified.acceptanceVersion,2);
 assert.equal(verified.totalMinor,10000);
});
test("caller-controlled customer, totals, status and receipt are not accepted inputs",async()=>{
 const h=fixture();
 const signed=await h.issuer.issue({...args,customerId:"attacker",totalMinor:1,
  acceptanceVersion:999,immutableConsentBytes:encoder.encode("fake"),
  receiptId:"attacker",state:"accepted"});
 assert.equal(signed.payload.customerId,"customerA");
 assert.equal(signed.payload.totalMinor,10000);
 assert.equal(signed.payload.receiptId,"receipt-1");
 assert.equal(signed.payload.consentSha256,consentSha);
});
test("permission, issuer authorization and malformed principal fail before frozen quotation read",async()=>{
 for(const input of [{...principal,permissions:[]},{...principal,tenantId:"tenant/other"},
  {...principal,userId:""}]){
  const h=fixture();await assert.rejects(
   h.issuer.issue({principal:input,quotationId:"quoteA"}),/acceptance_issuance_unverified/);
  assert.equal(h.stats().count.quotation,0);
 }
 const h=fixture({authorized:async()=>false});
 await assert.rejects(h.issuer.issue(args),/acceptance_issuance_unverified/);
 assert.equal(h.stats().count.quotation,0);
});
test("revoked, cross-tenant, invalid totals and unfrozen quotation fail before consent verification",async()=>{
 for(const change of [
  {state:"revoked"},{tenantId:"tenantB"},{quotationId:"another"},
  {customerId:""},{totalMinor:-1},{acceptanceVersion:0},
  {immutableQuotationBytes:new Uint8Array(0)},
 ]){
  const h=fixture({frozen:async()=>({...quote,...change})});
  await assert.rejects(h.issuer.issue(args),/acceptance_issuance_unverified/);
  assert.equal(h.stats().count.consent,0);
  assert.equal(h.stats().count.commit,0);
 }
});
test("consent mismatches, absent proof, forged hash and invalid records never sign or commit",async()=>{
 for(const change of [
  {verified:false},{state:"revoked"},{tenantId:"tenantB"},
  {customerId:"customerB"},{acceptanceVersion:3},
  {totalMinor:5000},{quotationSha256:"0".repeat(64)},
  {actorUserId:"other"},{acceptedAt:"tomorrow"},
  {immutableConsentBytes:new Uint8Array(0)}
 ]){
  const h=fixture({verifiedConsent:async()=>({...consent,...change})});
  await assert.rejects(h.issuer.issue(args),/acceptance_issuance_unverified/);
  assert.equal(h.stats().count.commit,0);
 }
});
test("authoritative lookup failure, consent outage, commit failure all fail closed",async()=>{
 for(const options of [
  {authorized:async()=>{throw Error("offline")}},
  {frozen:async()=>{throw Error("offline")}},
  {verifiedConsent:async()=>{throw Error("offline")}},
  {commit:async()=>false},
  {commit:async()=>{throw Error("offline")}}
 ]){
  const h=fixture(options);
  await assert.rejects(h.issuer.issue(args),/acceptance_issuance_unverified/);
 }
});
test("signed but revoked receipt cannot pass independent verifier current-state check",async()=>{
 const signed=await fixture().issuer.issue(args);
 const verifier=createEssentialsSignedAcceptanceVerifier({
  enabled:true,environment:"essentials-private-staging",
  publicKey:keys.publicKey,cryptoSubtle:subtle,now:()=>time+1000,
  loadServerSideReceipt:async()=>signed,
  verifyCurrentAuthorityReceipt:async()=>false
 });
 await assert.rejects(
  verifier({tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA"}),
  /acceptance_receipt_unverified/);
});
