import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createEssentialsPrivateConsentRequestBoundary} from
 "../server/essentials-private-consent-request-boundary.mjs";
const origin="https://private-consent.example.test";
const COOKIE="__Host-thebe-consent";
const sessionToken="S".repeat(43),csrfToken="C".repeat(43),nonce="N".repeat(43);
const at=Date.parse("2026-11-19T14:00:00Z");
const id=async value=>[...new Uint8Array(await webcrypto.subtle.digest(
 "SHA-256",new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,"0")).join("");
const sessionKeyHash=await id(sessionToken),csrfSha256=await id(csrfToken);
const principal={tenantId:"tenantA",userId:"actorA"};
const makeRequest=(overrides={})=>{
 const headers={
  "origin":origin,"sec-fetch-site":"same-origin",
  "content-type":"application/json","x-csrf-token":csrfToken,
  "cookie":COOKIE+"="+sessionToken,...(overrides.headers??{})
 };
 return new Request(overrides.url??origin+"/app/quotations/private/consent",{
  method:overrides.method??"POST",headers
 });
};
function harness(options={}){
 const calls={sessions:[],challenges:[],store:[]};
 const store={async loadOneTimeChallenge(input){
  calls.store.push(input);
  if(options.storeFails)throw Error("source_outage");
  return {challengeId:"challengeA",tenantId:"tenantA",
   actorUserId:"actorA",quotationId:"quoteA",customerId:"customerA",
   state:"pending",nonce,expiresAtMs:at+60_000,
   ...(options.storeResult??{})};
 }};
 const boundary=createEssentialsPrivateConsentRequestBoundary({
  enabled:true,environment:"essentials-private-staging",
  expectedOrigin:origin,cryptoSubtle:webcrypto.subtle,now:()=>at,
  loadActiveSession:async input=>{
   calls.sessions.push(input);
   if(options.sessionFails)throw Error("no_session");
   return {tenantId:"tenantA",actorUserId:"actorA",
    state:"active",csrfSha256,expiresAtMs:at+60_000,
    ...(options.session??{})};
  },
  loadSessionChallenge:async input=>{
   calls.challenges.push(input);
   if(options.boundFails)throw Error("no_bound_challenge");
   return {challengeId:"challengeA",tenantId:"tenantA",
    actorUserId:"actorA",quotationId:"quoteA",customerId:"customerA",
    state:"pending",nonce,expiresAtMs:at+60_000,
    ...(options.bound??{})};
  },
  oneTimeConsentStore:store
 });
 return {boundary,calls};
}
const captureParams={quotationId:"quoteA",challengeId:"challengeA"};
async function check(options={},req=makeRequest(),params=captureParams){
 const h=harness(options);
 await assert.rejects(h.boundary.validateCaptureRequest({
  request:req,...params
 }),/private_consent_session_unverified/);
 return h;
}
test("off by default and never accepts an unpinned or non-TLS origin",()=>{
 assert.throws(()=>createEssentialsPrivateConsentRequestBoundary(),
  /private_consent_session_disabled/);
 for(const expectedOrigin of ["http://private-consent.example.test",
  "https://private-consent.example.test/", "https://private-consent.example.test/evil",
  "https://private-consent.example.test?x=1"]){
  assert.throws(()=>createEssentialsPrivateConsentRequestBoundary({
   enabled:true,environment:"essentials-private-staging",expectedOrigin
  }),/private_consent_session_unconfigured/);
 }
});
test("secure request resolves only a server-session principal and session-owned challenge",async()=>{
 const h=harness();
 const context=await h.boundary.validateCaptureRequest({
  request:makeRequest(),...captureParams
 });
 assert.deepEqual(context.principal,principal);
 assert.equal(await context.verifyHostRequest({
  challengeId:"challengeA",method:"POST",operation:"accept-frozen-quotation"
 }),true);
 for(const change of [{challengeId:"other"},{method:"GET"},{operation:"transfer-money"}]){
  assert.equal(await context.verifyHostRequest({
   challengeId:"challengeA",method:"POST",
   operation:"accept-frozen-quotation",...change
  }),false);
 }
 const challenge=await context.loadOneTimeChallenge({challengeId:"challengeA"});
 assert.equal(challenge.customerId,"customerA");
 assert.deepEqual(h.calls.sessions,[{sessionKeyHash}]);
 assert.deepEqual(h.calls.challenges,[{
  sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA",
  quotationId:"quoteA",challengeId:"challengeA"
 }]);
 assert.deepEqual(h.calls.store,[{
  principal,quotationId:"quoteA",challengeId:"challengeA",nonce
 }]);
 assert.equal(JSON.stringify(h.calls).includes(sessionToken),false);
 assert.equal(JSON.stringify(h.calls).includes(csrfToken),false);
 await assert.rejects(context.loadOneTimeChallenge({challengeId:"other"}),
  /private_consent_session_unverified/);
});
test("cross-origin, cross-site, malformed cookie or missing CSRF fails before storage access",async()=>{
 const invalidRequests=[
  makeRequest({headers:{origin:"https://attacker.example.test"}}),
  makeRequest({headers:{"sec-fetch-site":"cross-site"}}),
  makeRequest({headers:{"sec-fetch-site":"none"}}),
  makeRequest({headers:{"x-csrf-token":"invalid"}}),
  makeRequest({headers:{cookie:COOKIE+"="+sessionToken+"; "+COOKIE+"="+sessionToken}}),
  makeRequest({headers:{cookie:COOKIE+"=not-an-opaque-token"}}),
  makeRequest({headers:{"content-type":"text/plain"}}),
  makeRequest({url:origin+"/app/quotations/private/consent?nonce=evil"}),
  makeRequest({url:"https://other.example.test/app/quotations/private/consent"}),
  makeRequest({method:"GET"})
 ];
 for(const req of invalidRequests){
  const h=await check({},req);
  assert.equal(h.calls.sessions.length,0);
  assert.equal(h.calls.challenges.length,0);
  assert.equal(h.calls.store.length,0);
 }
});
test("bad CSRF proof, dead session, stale bound challenge, changed account and outaged stores deny",async()=>{
 const cases=[
  {session:{csrfSha256:"f".repeat(64)}},
  {session:{state:"revoked"}},{session:{expiresAtMs:at}},
  {session:{tenantId:"tenantB"}},{session:{actorUserId:"actorB"}},
  {sessionFails:true},{boundFails:true},
  {bound:{state:"revoked"}},{bound:{expiresAtMs:at}},
  {bound:{challengeId:"other"}},
  {bound:{tenantId:"other"}},
  {bound:{actorUserId:"other"}},
  {bound:{quotationId:"other"}},
  {bound:{nonce:"short"}},
  {bound:{customerId:"bad/id"}}
 ];
 for(const opts of cases){
  const h=harness(opts);
  await assert.rejects(h.boundary.validateCaptureRequest({
   request:makeRequest(),...captureParams
  }),/private_consent_session_unverified/);
  assert.equal(h.calls.store.length,0);
 }
 for(const opts of [
  {storeFails:true},{storeResult:{state:"revoked"}},
  {storeResult:{customerId:"other"}},{storeResult:{tenantId:"other"}},
  {storeResult:{nonce:"different"}},{storeResult:{expiresAtMs:at+90_000}}
 ]){
  const h=harness(opts);
  const context=await h.boundary.validateCaptureRequest({
   request:makeRequest(),...captureParams
  });
  await assert.rejects(context.loadOneTimeChallenge({challengeId:"challengeA"}),
   /private_consent_session_unverified/);
 }
});
