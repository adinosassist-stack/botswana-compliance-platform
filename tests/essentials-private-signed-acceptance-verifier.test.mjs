import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createEssentialsSignedAcceptanceVerifier} from "../server/essentials-private-signed-acceptance-verifier.mjs";
import {createEssentialsVerifiedAcceptanceWriter} from "../server/essentials-private-acceptance-evidence-writer.mjs";
const subtle=webcrypto.subtle;
const {publicKey,privateKey}=await subtle.generateKey("Ed25519",false,["sign","verify"]);
const now=Date.parse("2026-11-19T09:06:00Z");
const base={
 acceptedAt:"2026-11-19T09:00:00Z",acceptedByUserId:"synthetic-owner-a",acceptanceVersion:2,
 consentSha256:"a".repeat(64),customerId:"synthetic-customer-a",
 expiresAt:"2026-11-19T09:10:00Z",issuedAt:"2026-11-19T09:05:00Z",
 issuer:"thebe-private-quotation-consent-staging",
 purpose:"thebe.essentials.quotation-acceptance.v1",
 quotationId:"quote-1",quotationReference:"Q-100",
 quotationSha256:"b".repeat(64),receiptId:"receipt-1",
 tenantId:"synthetic-tenant-a",totalMinor:10000
};
const params={tenantId:base.tenantId,quotationId:base.quotationId,actorUserId:base.acceptedByUserId};
async function signed(payload=base){
 const json=JSON.stringify(Object.fromEntries(Object.keys(payload).sort().map(k=>[k,payload[k]])));
 const bytes=await subtle.sign("Ed25519",privateKey,new TextEncoder().encode(json));
 return {payload,signature:Buffer.from(bytes).toString("base64url")};
}
const make=({receipt,authority=async()=>true,load,clock=()=>now}={})=>{
 let loads=0,checks=0,argumentsSeen;
 const verify=createEssentialsSignedAcceptanceVerifier({
  enabled:true,environment:"essentials-private-staging",publicKey,cryptoSubtle:subtle,
  now:clock,
  loadServerSideReceipt:async args=>{loads++;return load?load(args):receipt},
  verifyCurrentAuthorityReceipt:async args=>{checks++;argumentsSeen=args;return authority(args)}
 });
 return {verify,stats:()=>({loads,checks,argumentsSeen})};
};
test("disabled by default, fails with no issuer public key",()=>{
 assert.throws(()=>createEssentialsSignedAcceptanceVerifier(),/acceptance_verifier_disabled/);
 assert.throws(()=>createEssentialsSignedAcceptanceVerifier({
  enabled:true,environment:"essentials-private-staging",
  loadServerSideReceipt:async()=>null,verifyCurrentAuthorityReceipt:async()=>false
 }),/acceptance_verifier_unconfigured/);
});
test("valid signed receipt AND fresh authority proof bind all financial and consent fields",async()=>{
 const h=make({receipt:await signed()});
 const result=await h.verify(params);
 assert.deepEqual(result,{verified:true,tenantId:base.tenantId,quotationId:base.quotationId,
  customerId:base.customerId,quotationReference:base.quotationReference,
  acceptanceVersion:2,totalMinor:10000,acceptedByUserId:base.acceptedByUserId,
  acceptedAt:base.acceptedAt});
 assert.equal(h.stats().loads,1);assert.equal(h.stats().checks,1);
 assert.equal(h.stats().argumentsSeen.quotationSha256,base.quotationSha256);
 assert.equal(h.stats().argumentsSeen.consentSha256,base.consentSha256);
});
test("real writer composition can record only verified receipt; no client-supplied amount",async()=>{
 let writes=0,args;
 const verifier=make({receipt:await signed()}).verify;
 const writer=createEssentialsVerifiedAcceptanceWriter({
  enabled:true,environment:"essentials-private-staging",
  verifyAuthoritativeAcceptance:verifier,
  db:{prepare:()=>({bind:(...values)=>({run:async()=>{writes++;args=values;return{
   success:true,meta:{changes:1}
  }}})})}
 });
 const principal={tenantId:base.tenantId,userId:base.acceptedByUserId,
  permissions:["quotation:accept:record"]};
 const result=await writer.record({principal,quotationId:base.quotationId,totalMinor:1,
  customerId:"other"});
 assert.equal(result.state,"accepted");assert.equal(writes,1);
 assert.equal(args[5],base.totalMinor);assert.equal(args[2],base.customerId);
});
test("rejects edited or invalid signatures before consulting live authority",async()=>{
 const good=await signed();
 for(const receipt of [
  {...good,payload:{...base,totalMinor:9000}},
  {...good,payload:{...base,customerId:"other"}},
  {...good,signature:"A"+good.signature.slice(1)},
  {...good,signature:"invalid"},
  {...good,payload:{...base,unexpected:"claim"}},
  {...good,payload:{...base,consentSha256:"invalid"}}
 ]){
  const h=make({receipt});
  await assert.rejects(h.verify(params),/acceptance_receipt_unverified/);
  assert.equal(h.stats().checks,0);
 }
});
test("tenant, quote and author spoofing fail without accessing receipt service",async()=>{
 const h=make({receipt:await signed()});
 for(const args of [{...params,tenantId:"../../other"},
  {...params,quotationId:""}, {...params,actorUserId:"invalid/user"}]){
  await assert.rejects(h.verify(args),/acceptance_receipt_unverified/);
 }
 assert.equal(h.stats().loads,0);
 for(const args of [{...params,tenantId:"other"},
  {...params,quotationId:"quote-2"}, {...params,actorUserId:"other"}]){
  await assert.rejects(h.verify(args),/acceptance_receipt_unverified/);
 }
 assert.equal(h.stats().checks,0);
});
test("expires, future issuance, invalid dates and excessive life all fail closed",async()=>{
 for(const payload of [
  {...base,expiresAt:"2026-11-19T09:05:00Z"},
  {...base,issuedAt:"2026-11-19T09:08:00Z"},
  {...base,expiresAt:"2026-11-19T10:00:00Z"},
  {...base,acceptedAt:"tomorrow"},
  {...base,acceptedAt:"2026-11-19T09:06:00Z"}
 ]){
  const h=make({receipt:await signed(payload)});
  await assert.rejects(h.verify(params),/acceptance_receipt_unverified/);
  assert.equal(h.stats().checks,0);
 }
});
test("revoked or unavailable acceptance source never reaches a verified response",async()=>{
 for(const authority of [async()=>false,async()=>{throw Error("authority_offline")}]) {
  const h=make({receipt:await signed(),authority});
  await assert.rejects(h.verify(params),/acceptance_receipt_unverified/);
  assert.equal(h.stats().checks,1);
 }
 const h=make({load:async()=>{throw Error("receipt_server_offline")}});
 await assert.rejects(h.verify(params),/acceptance_receipt_unverified/);
 assert.equal(h.stats().checks,0);
});
