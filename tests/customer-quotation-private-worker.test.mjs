import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import inertWorker,{
 C4_PRIVATE_CUSTOMER_STAGING,
 createEssentialsPrivateCustomerWorkerCandidate as compose
} from "../server/essentials-private-customer-worker-candidate.mjs";
import {
 C4_CUSTOMER_RESOURCE_LOCK,assessCustomerQuotationPrivateReadiness as assess
} from "../scripts/customer-quotation-private-readiness.mjs";

const origin="https://customer.private.example";
const db={prepare(){return{}},async batch(){return[]}};
const nonce="N".repeat(32);
const mockJourney={
 async beginCustomerLogin(){return{
  authorizationUrl:"https://accounts.google.com/o/oauth2/v2/auth",
  setCookie:"__Host-thebe-customer-oauth="+"S".repeat(43)+
   "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=300"
 }},
 async completeCustomerLogin(){return{
  quotationId:"quoteA",
  customerSetCookie:"__Host-thebe-customer="+"C".repeat(43)+
   "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=150",
  csrfSetCookie:"__Host-thebe-customer-csrf="+"X".repeat(43)+
   "; Secure; SameSite=Strict; Path=/; Max-Age=150",
  oauthClearCookie:"__Host-thebe-customer-oauth=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
 }}
};
const sampleReview={
 quotationId:"quoteA",quotationReference:"Q-101",presentationId:"reviewA",
 acceptanceVersion:1,totalMinor:10000,quotationSha256:"a".repeat(64),
 termsSha256:"b".repeat(64),
 immutableQuotationBytes:new TextEncoder().encode("Quotation Q-101 amount P100.00"),
 immutableTermsBytes:new TextEncoder().encode("Full customer terms")
};
const base={
 enabled:true,environment:"essentials-private-staging",expectedOrigin:origin,database:db,
 journey:mockJourney,
 customerReviewBoundary:{async prepareCustomerReview(){return sampleReview}},
 consentCommitter:{async commitExplicitCustomerAcceptance(){
  return {state:"recorded",quotationId:"quoteA",acceptedAtMs:1,
   acceptanceSha256:"f".repeat(64)}
 }},
 authorizeProtectedHostRequest:async()=>true,
 enforceCustomerRateLimit:async()=>true,
 makeCspNonce:async()=>nonce
};
test("accidental Worker deployment is always 404-only, never exposes customer routes",async()=>{
 for(const path of [
  "/","/private/customer/invitations/inviteA",
  "/private/customer/quotations/quoteA/review",
  "/private/customer/oidc/callback?code=secret",
  "/private/customer/quotations/quoteA/accept"
 ]){
  const r=await inertWorker.fetch(new Request(origin+path));
  assert.equal(r.status,404);
  assert.equal(await r.text(),"Not Found");
  assert.match(r.headers.get("cache-control"),/no-store/);
 }
 assert.equal(C4_PRIVATE_CUSTOMER_STAGING.defaultWorkerEnabled,false);
 assert.equal(C4_PRIVATE_CUSTOMER_STAGING.publicRoutesAuthorized,false);
});
test("named private candidate requires explicit source gate, exact staging environment and real D1 interface",()=>{
 assert.throws(()=>compose(),/private_customer_worker_disabled/);
 assert.throws(()=>compose({...base,enabled:false}),/private_customer_worker_disabled/);
 assert.throws(()=>compose({...base,environment:"production"}),/private_customer_worker_disabled/);
 assert.throws(()=>compose({...base,database:{}}),/private_customer_worker_unconfigured/);
 assert.throws(()=>compose({...base,expectedOrigin:"http://customer.private.example"}),
  /private_customer_worker_unconfigured/);
 assert.throws(()=>compose({...base,expectedOrigin:origin+"/path"}),
  /private_customer_worker_unconfigured/);
 assert.throws(()=>compose({...base,journey:{}}),/private_customer_staging_gateway_unconfigured/);
});
test("named candidate refuses missing/wrong runtime DB binding, independent of URL or env toggle",async()=>{
 const w=compose(base);
 for(const env of [undefined,{},{
  CUSTOMER_CONSENT_DB:{prepare(){return{}},batch(){return[]}},
  CUSTOMER_LOGIN_ENABLED:true
 }]){
  const r=await w.fetch(new Request(origin+"/private/customer/invitations/inviteA"),env);
  assert.equal(r.status,404);
 }
 const allowed=await w.fetch(
  new Request(origin+"/private/customer/invitations/inviteA"),
  {CUSTOMER_CONSENT_DB:db});
 assert.equal(allowed.status,200);
 const html=await allowed.text();
 assert.match(html,/Verify your identity/);
 assert.match(allowed.headers.get("cache-control"),/no-store/);
});
test("independent private-host authorization is checked before any customer page is rendered",async()=>{
 const w=compose({...base,authorizeProtectedHostRequest:async()=>false});
 const r=await w.fetch(new Request(origin+"/private/customer/invitations/inviteA"),
  {CUSTOMER_CONSENT_DB:db});
 assert.equal(r.status,403);
 const mismatch=await compose(base).fetch(new Request(
  "https://evil.example/private/customer/invitations/inviteA"),
  {CUSTOMER_CONSENT_DB:db});
 assert.equal(mismatch.status,404);
});
test("isolated review manifest cannot expose worker.dev, preview URLs or public routes",async()=>{
 const raw=await readFile(new URL(
  "../deploy/customer-quotation-private-staging/wrangler.jsonc",import.meta.url),"utf8");
 const cfg=JSON.parse(raw.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n"));
 assert.equal(cfg.name,C4_CUSTOMER_RESOURCE_LOCK.workerName);
 assert.equal(cfg.workers_dev,false);
 assert.equal(cfg.preview_urls,false);
 assert.deepEqual(cfg.routes,[]);
 assert.equal(cfg.main,"../../server/essentials-private-customer-worker-candidate.mjs");
 assert.deepEqual(cfg.d1_databases,[{
  binding:"CUSTOMER_CONSENT_DB",
  database_name:C4_CUSTOMER_RESOURCE_LOCK.databaseName,
  database_id:C4_CUSTOMER_RESOURCE_LOCK.databaseId
 }]);
 assert.equal(JSON.stringify(cfg).includes("thebe-desk-production"),false);
});
const source="a".repeat(40),digest="f".repeat(64);
function evidence(){
 return {
  mainSha:source,reviewedSha:source,sourceDigest:digest,
  inventory:{
   accountId:C4_CUSTOMER_RESOURCE_LOCK.accountId,
   database:{id:C4_CUSTOMER_RESOURCE_LOCK.databaseId,
    name:C4_CUSTOMER_RESOURCE_LOCK.databaseName,
    schemaAttested:true,backupRestoreAccepted:true},
   worker:{name:C4_CUSTOMER_RESOURCE_LOCK.workerName,
    compiledSourceDigest:digest,bindingsVerified:true,
    workersDev:false,previewUrls:false,routes:[]},
   protectedHost:"https://customer.private.example",
   access:{privateOnly:true,policyVerified:true,
    host:"https://customer.private.example"}
  },
  identity:{issuerPinned:true,clientRegistered:true,
   confidentialExchangeVerified:true,jwksRotationReviewed:true},
  customerAuthority:{independentOwnershipVerifier:true,
   trustedInvitationDelivery:true,frozenQuoteAndFullTerms:true},
  qualification:{syntheticInviteLoginQuoteAcceptance:true,
   crossTenantCsrfReplayRevocationNegative:true,
   mobileAccessibilityAndRecovery:true},
  approvals:{ownerExactSource:true,independentThusicoExactSource:true,
   stagingOperationsAuthorized:true}
 };
}
test("readiness checker never authorizes a Worker upload, deployment or production activation",()=>{
 const q=assess(evidence());
 assert.deepEqual(q.blockers,[]);
 assert.equal(q.privateStagingEvidenceComplete,true);
 assert.equal(q.workerUploadAuthorized,false);
 assert.equal(q.privateStagingDeployAuthorized,false);
 assert.equal(q.publicCustomerLoginAuthorized,false);
 assert.equal(q.productionActivationAuthorized,false);
});
test("source drift, missing customer authority, public route or fake reviewer proof block qualification",()=>{
 const variants=[
  {mainSha:"b".repeat(40)},
  {inventory:{...evidence().inventory,worker:{...evidence().inventory.worker,routes:["*/*"]}}},
  {customerAuthority:{...evidence().customerAuthority,independentOwnershipVerifier:false}},
  {approvals:{...evidence().approvals,independentThusicoExactSource:false}},
  {identity:{...evidence().identity,confidentialExchangeVerified:false}},
  {inventory:{...evidence().inventory,access:{...evidence().inventory.access,privateOnly:false}}},
  {qualification:{...evidence().qualification,crossTenantCsrfReplayRevocationNegative:false}}
 ];
 for(const variant of variants){
  const got=assess({...evidence(),...variant});
  assert.ok(got.blockers.length>0);
  assert.equal(got.privateStagingEvidenceComplete,false);
  assert.equal(got.productionActivationAuthorized,false);
 }
 assert.ok(assess().blockers.length>=8);
});
