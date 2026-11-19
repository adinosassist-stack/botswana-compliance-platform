import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
 createEssentialsPrivateOneTimeConsentStore,
 ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL,
 ESSENTIALS_PRIVATE_LOAD_CHALLENGE_SQL,
 ESSENTIALS_PRIVATE_COMMIT_CONSENT_SQL
} from "../server/essentials-private-one-time-consent-store.mjs";

const subtle=webcrypto.subtle,encoder=new TextEncoder();
const at=Date.now();
const principal={tenantId:"tenantA",userId:"actorA"};
const quoteHash="a".repeat(64);
const hex=async bytes=>Array.from(new Uint8Array(await subtle.digest("SHA-256",bytes)),
 b=>b.toString(16).padStart(2,"0")).join("");
const nonce=Buffer.alloc(32,17).toString("base64url");
const nonceHash=await hex(encoder.encode(nonce));
const row={
 challenge_id:"challengeA",tenant_id:"tenantA",quotation_id:"quoteA",
 actor_user_id:"actorA",customer_id:"customerA",
 quotation_reference:"Q-101",acceptance_version:2,total_minor:10000,
 quotation_sha256:quoteHash,nonce_sha256:nonceHash,
 issued_at_ms:at-10000,expires_at_ms:at+100000
};
function harness({authorized=true,changes=1,missing=false,fail=false}={}){
 const calls=[];
 const db={prepare(sql){
  return {bind(...args){
   calls.push({sql,args});
   return {
    async run(){if(fail)throw Error("D1 outage");return {success:true,meta:{changes}};},
    async first(){if(fail)throw Error("D1 outage");return missing?null:row;}
   };
  }};
 }};
 const store=createEssentialsPrivateOneTimeConsentStore({
  enabled:true,environment:"essentials-private-staging",db,cryptoSubtle:subtle,
  randomBytes:size=>new Uint8Array(size).fill(17),randomUUID:()=>"challengeA",
  now:()=>at,authorizeHostSession:async()=>authorized
 });
 return {store,calls};
}
function consentArgs(overrides={}){
 const acceptedAt=new Date(at).toISOString().replace(/\.000Z$/,"Z");
 const ev={
  method:"oidc-rs256-explicit-accept-v1",decision:"accept",
  challengeId:"challengeA",tenantId:"tenantA",quotationId:"quoteA",
  actorUserId:"actorA",customerId:"customerA",quotationReference:"Q-101",
  acceptanceVersion:2,totalMinor:10000,quotationSha256:quoteHash,
  consentSubjectId:"customerAuthA",customerIdentityLinkId:"linkA",
  identitySubjectHmacSha256:"c".repeat(64),challengeNonceSha256:nonceHash,
  identitySubjectSha256:"b".repeat(64),identityIssuer:"https://id.example.test",
  reauthenticatedAt:acceptedAt,acceptedAt
 };
 return {...ev,immutableConsentBytes:encoder.encode(JSON.stringify(ev)),...overrides};
}
test("isolated store is disabled unless private host and D1 are configured",()=>{
 assert.throws(()=>createEssentialsPrivateOneTimeConsentStore(),
  /private_one_time_consent_disabled/);
 assert.throws(()=>createEssentialsPrivateOneTimeConsentStore({
  enabled:true,environment:"production"
 }),/private_one_time_consent_disabled/);
 assert.throws(()=>createEssentialsPrivateOneTimeConsentStore({
  enabled:true,environment:"essentials-private-staging"
 }),/private_one_time_consent_unconfigured/);
});
test("begin saves a fresh random challenge hash with one bound statement",async()=>{
 const h=harness();
 const created=await h.store.begin({principal,quotationId:"quoteA"});
 assert.equal(created.challengeId,"challengeA");
 assert.equal(created.nonce,nonce);
 assert.equal(h.calls[0].sql,ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL);
 assert.deepEqual(h.calls[0].args,[
  "challengeA","actorA",nonceHash,at,at+300000,"tenantA","quoteA"
 ]);
 assert.ok(!h.calls[0].args.includes(nonce));
});
test("read returns exact frozen challenge only for private authenticated host nonce",async()=>{
 const h=harness();
 const found=await h.store.loadOneTimeChallenge({
  principal,quotationId:"quoteA",challengeId:"challengeA",nonce
 });
 assert.equal(found.customerId,"customerA");
 assert.equal(found.quotationSha256,quoteHash);
 assert.equal(found.nonce,nonce);
 assert.equal(h.calls[0].sql,ESSENTIALS_PRIVATE_LOAD_CHALLENGE_SQL);
 for(const invalid of [{nonce:"other"},{challengeId:"other"},{principal:{...principal,userId:"other"}}]){
  const x=harness();
  await assert.rejects(x.store.loadOneTimeChallenge({
   principal,quotationId:"quoteA",challengeId:"challengeA",nonce,...invalid
  }),/private_one_time_consent_unverified/);
 }
});
test("trusted capture evidence binds exactly to one guarded attestation INSERT",async()=>{
 const h=harness(),ev=consentArgs();
 const params={challengeId:ev.challengeId,tenantId:ev.tenantId,
  quotationId:ev.quotationId,actorUserId:ev.actorUserId,customerId:ev.customerId,
  quotationReference:ev.quotationReference,acceptanceVersion:ev.acceptanceVersion,
  totalMinor:ev.totalMinor,quotationSha256:ev.quotationSha256,
  consentSubjectId:ev.consentSubjectId,immutableConsentBytes:ev.immutableConsentBytes,
  consentSha256:await hex(ev.immutableConsentBytes),acceptedAt:ev.acceptedAt};
 assert.equal(await h.store.commitVerifiedConsent(params),true);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].sql,ESSENTIALS_PRIVATE_COMMIT_CONSENT_SQL);
 assert.equal(h.calls[0].args.length,15);
 assert.equal(h.calls[0].args[9],nonceHash);
 assert.deepEqual(h.calls[0].args[11],Array.from(ev.immutableConsentBytes));
});
test("tampered bytes, subject, acceptance, total and failed D1 writes are denied",async()=>{
 const ev=consentArgs();
 const params={challengeId:ev.challengeId,tenantId:ev.tenantId,
  quotationId:ev.quotationId,actorUserId:ev.actorUserId,customerId:ev.customerId,
  quotationReference:ev.quotationReference,acceptanceVersion:ev.acceptanceVersion,
  totalMinor:ev.totalMinor,quotationSha256:ev.quotationSha256,
  consentSubjectId:ev.consentSubjectId,immutableConsentBytes:ev.immutableConsentBytes,
  consentSha256:await hex(ev.immutableConsentBytes),acceptedAt:ev.acceptedAt};
 for(const invalid of [
  {consentSha256:"c".repeat(64)}, {customerId:"other"},
  {totalMinor:1}, {consentSubjectId:"other"},
  {immutableConsentBytes:encoder.encode('{"decision":"decline"}')},
  {acceptedAt:"invalid"}, {quotationSha256:"f".repeat(64)}
 ]){
  const h=harness();
  await assert.rejects(h.store.commitVerifiedConsent({...params,...invalid}),
   /private_one_time_consent_unverified/);
  assert.equal(h.calls.length,0);
 }
 for(const cfg of [{changes:0},{fail:true}]){
  const h=harness(cfg);
  await assert.rejects(h.store.commitVerifiedConsent(params),
   /private_one_time_consent_unverified/);
 }
});
test("no challenge write if host authorization or DB fails",async()=>{
 for(const cfg of [{authorized:false},{changes:0},{fail:true}]){
  const h=harness(cfg);
  await assert.rejects(h.store.begin({principal,quotationId:"quoteA"}),
   /private_one_time_consent_unverified/);
 }
});
