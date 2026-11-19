import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createEssentialsPrivateFrozenEvidenceReader,
 ESSENTIALS_PRIVATE_FROZEN_EVIDENCE_SQL}
 from "../server/essentials-private-frozen-evidence-reader.mjs";
import {createEssentialsPrivateAcceptanceReceiptIssuer}
 from "../server/essentials-private-acceptance-receipt-issuer.mjs";
const subtle=webcrypto.subtle;
const encoder=new TextEncoder();
const quoteBytes=encoder.encode("SYNTHETIC IMMUTABLE quoteA tenantA v2 P100.00");
const consentBytes=encoder.encode("SYNTHETIC customerA signed explicit quoteA v2");
const digest=async bytes=>[...new Uint8Array(await subtle.digest("SHA-256",bytes))]
 .map(byte=>byte.toString(16).padStart(2,"0")).join("");
const quoteHash=await digest(quoteBytes),consentHash=await digest(consentBytes);
const row={tenant_id:"tenantA",quotation_id:"quoteA",actor_user_id:"actorA",
 customer_id:"customerA",quotation_reference:"Q-101",acceptance_version:2,
 total_minor:10000,consent_subject_id:"customer-authenticated-subject",
 accepted_at:"2026-11-19T09:00:00Z",quotation_sha256:quoteHash,
 consent_sha256:consentHash,quotation_bytes:Array.from(quoteBytes),
 consent_bytes:Array.from(consentBytes)};
const params={tenantId:"tenantA",quotationId:"quoteA",actorUserId:"actorA"};
function harness({source=row,fail=false}={}){
 const calls=[];
 const db={prepare:sql=>{
  calls.push({sql,params:[]});
  const call=calls[calls.length-1];
  return{bind:(...values)=>{
   call.params=values;
   return {first:async()=>{
    if(fail)throw Error("source_offline");
    return source;
   }};
  }};
 }};
 const reader=createEssentialsPrivateFrozenEvidenceReader({
  enabled:true,environment:"essentials-private-staging",db,cryptoSubtle:subtle
 });
 return {reader,calls};
}
test("disabled by default and requires private staging D1 and hash implementation",()=>{
 assert.throws(()=>createEssentialsPrivateFrozenEvidenceReader(),/private_frozen_evidence_disabled/);
 assert.throws(()=>createEssentialsPrivateFrozenEvidenceReader({
  enabled:true,environment:"essentials-private-staging",db:{prepare(){}} ,
  cryptoSubtle:{}
 }),/private_frozen_evidence_unconfigured/);
});
test("trusted same-D1 read verifies actual stored quotation and consent BLOB digests",async()=>{
 const h=harness();
 const q=await h.reader.loadFrozenAcceptedQuotation(params);
 assert.equal(q.state,"accepted");assert.equal(q.totalMinor,10000);
 assert.deepEqual(Array.from(q.immutableQuotationBytes),Array.from(quoteBytes));
 assert.equal(h.calls[0].sql,ESSENTIALS_PRIVATE_FROZEN_EVIDENCE_SQL);
 assert.deepEqual(h.calls[0].params,["tenantA","quoteA","actorA"]);
 assert.match(h.calls[0].sql,/q.state='accepted' AND c.state='accepted'/);
 const consent=await h.reader.verifyRecordedCustomerConsent({
  ...params,customerId:q.customerId,quotationReference:q.quotationReference,
  acceptanceVersion:q.acceptanceVersion,totalMinor:q.totalMinor,
  quotationSha256:quoteHash
 });
 assert.equal(consent.verified,true);
 assert.deepEqual(Array.from(consent.immutableConsentBytes),Array.from(consentBytes));
 assert.equal(h.calls.length,2);
});
test("synthetic frozen reader is compatible with issuer, without proving actual consent capture",async()=>{
 const h=harness(),keys=await subtle.generateKey("Ed25519",false,["sign","verify"]);
 const issued=[];
 const issuer=createEssentialsPrivateAcceptanceReceiptIssuer({
  enabled:true,environment:"essentials-private-staging",privateKey:keys.privateKey,
  cryptoSubtle:subtle,randomUUID:()=>"receiptA",
  now:()=>Date.parse("2026-11-19T09:05:00Z"),
  verifyIssuerAuthorization:async()=>true,
  loadFrozenAcceptedQuotation:h.reader.loadFrozenAcceptedQuotation,
  verifyRecordedCustomerConsent:h.reader.verifyRecordedCustomerConsent,
  commitImmutableReceipt:async record=>{issued.push(record);return true}
 });
 const receipt=await issuer.issue({principal:{tenantId:"tenantA",userId:"actorA",
  permissions:["quotation:accept:record"]},quotationId:"quoteA"});
 assert.equal(receipt.payload.quotationSha256,quoteHash);
 assert.equal(receipt.payload.consentSha256,consentHash);
 assert.equal(issued.length,1);
 assert.equal(issued[0].expectedConsentSha256,consentHash);
});
test("altered quotation or consent bytes are rejected even when stored metadata says accepted",async()=>{
 for(const change of [
  {quotation_bytes:[5,6,7]},
  {consent_bytes:[5,6,7]},
  {quotation_sha256:"a".repeat(64)},
  {consent_sha256:"b".repeat(64)},
  {consent_subject_id:""},
  {consent_subject_id:"../invalid"},
  {total_minor:-1},
  {actor_user_id:"other"},
  {customer_id:""},
  {quotation_bytes:[]},
  {consent_bytes:[257]},
  {consent_bytes:"test"}
 ]){
  const h=harness({source:{...row,...change}});
  await assert.rejects(h.reader.loadFrozenAcceptedQuotation(params),
   /private_frozen_evidence_unverified/);
 }
});
test("wrong tenant, quote, actor, version, customer, amount and quotation digest never pass issuer consent callback",async()=>{
 const h=harness();
 const expected={...params,customerId:"customerA",quotationReference:"Q-101",
  acceptanceVersion:2,totalMinor:10000,quotationSha256:quoteHash};
 for(const change of [
  {tenantId:"other"},{quotationId:"other"},{actorUserId:"other"},
  {customerId:"other"},{quotationReference:"other"},{acceptanceVersion:3},
  {totalMinor:5000},{quotationSha256:"f".repeat(64)}
 ]){
  await assert.rejects(h.reader.verifyRecordedCustomerConsent({...expected,...change}),
   /private_frozen_evidence_unverified/);
 }
});
test("revoked or missing joined evidence and unavailable D1 fail closed",async()=>{
 for(const opts of [{source:null},{fail:true}]){
  const h=harness(opts);
  await assert.rejects(h.reader.loadFrozenAcceptedQuotation(params),
   /private_frozen_evidence_unverified/);
 }
});
