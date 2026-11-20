import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import sourceDefault,{
 createC4CustomerOwnershipSourceIssuer as createIssuer,
 C4_CUSTOMER_OWNERSHIP_ISSUER_CONTRACT as scope
} from "../server/essentials-private-customer-ownership-source-issuer.mjs";
import {
 createC4TrustedCustomerOwnershipVerifier as createVerifier
} from "../server/essentials-private-customer-ownership-authority-bridge.mjs";

const subtle=webcrypto.subtle;
const issuer="https://authority.private.example";
const nowMs=1795190400000;
const ids={tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA",linkId:"linkA"};
const keyId="c4-source-test-key-1";
const nonce="A".repeat(43);
const good={
 customer:{tenantId:"tenantA",customerId:"customerA",state:"active",revoked:false,deleted:false},
 quote:{tenantId:"tenantA",customerId:"customerA",quotationId:"quoteA",
  state:"accepted",published:true,revoked:false,
  acceptanceVersion:2,totalMinor:450000,
  quotationSha256:"a".repeat(64),termsSha256:"b".repeat(64),
  immutableQuoteVerified:true,immutableFullTermsVerified:true},
 link:{tenantId:"tenantA",customerId:"customerA",linkId:"linkA",
  state:"active",revoked:false,proofReferenceSha256:"f".repeat(64),
  provisionedByAuthorizedActor:true}
};
let pairs;
const keys=async()=>{
 if(!pairs)pairs=await subtle.generateKey({
  name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"
 },false,["sign","verify"]);
 return pairs;
};
function makeChallenge(overrides={}){
 return {schema:"thebe-c4-customer-ownership-challenge-v1",
 audience:scope.audience,nonce,...ids,...overrides};
}
function req(body=makeChallenge(),headers={}){
 return new Request(scope.internalServiceUrl,{
  method:"POST",redirect:"error",cache:"no-store",credentials:"omit",
  headers:{"content-type":"application/json","accept":"application/jwt",
   "cache-control":"no-store",...headers},
  body:typeof body==="string"?body:JSON.stringify(body)
 });
}
async function fixture({customer=good.customer,quote=good.quote,
 link=good.link,allow=true,rate=true,independent=true,
 throwOnRead=false}={}){
 const p=await keys();
 const calls={caller:0,limit:0,customer:0,quote:0,link:0,independent:0};
 const config={
  enabled:true,environment:"essentials-private-staging",
  issuer,keyId,signingKey:p.privateKey,
  cryptoSubtle:subtle,now:()=>nowMs,
  authorizePrivateCaller:async()=>{calls.caller++;return allow},
  rateLimitPrivateCaller:async()=>{calls.limit++;return rate},
  readCurrentCustomer:async()=>{calls.customer++;if(throwOnRead)throw Error("db down");return customer},
  readPublishedQuotationAndTerms:async()=>{calls.quote++;if(throwOnRead)throw Error("db down");return quote},
  readCurrentIdentityLink:async()=>{calls.link++;if(throwOnRead)throw Error("db down");return link},
  verifyIndependentCustomerOwnership:async()=>{calls.independent++;return independent}
 };
 const source=createIssuer(config);
 let num=1;
 const client=createVerifier({
  enabled:true,environment:"essentials-private-staging",
  issuer,keyId,publicKey:p.publicKey,cryptoSubtle:subtle,
  sourceBinding:{fetch:r=>source.handleRequest(r)},
  randomBytes:n=>new Uint8Array(n).fill(num++),
  now:()=>nowMs
 });
 return {source,client,config,calls};
}
test("default source Worker and incomplete issuer deny every request",async()=>{
 const r=await sourceDefault.fetch(req());
 assert.equal(r.status,404);
 assert.match(r.headers.get("cache-control"),/no-store/);
 assert.throws(()=>createIssuer(),/disabled/);
 assert.throws(()=>createIssuer({enabled:true,environment:"essentials-private-staging"}),/unconfigured/);
 const f=await fixture();
 assert.throws(()=>createIssuer({...f.config,environment:"production"}),/disabled/);
 assert.throws(()=>createIssuer({...f.config,authorizePrivateCaller:undefined}),/unconfigured/);
 assert.equal(scope.defaultEnabled,false);
 assert.equal(scope.realBusinessReadAdaptersProvided,false);
 assert.equal(scope.publicCustomerLoginEnabled,false);
 assert.equal(scope.cloudMutationAuthorized,false);
});
test("real issuer and signed consumer verifier accept one exact live customer and accepted quotation",async()=>{
 const f=await fixture();
 assert.equal(await f.client.verifyCurrentCustomerOwnership(ids),true);
 assert.deepEqual(f.calls,{caller:1,limit:1,customer:1,quote:1,link:1,independent:1});
 const raw=await f.source.handleRequest(req());
 assert.equal(raw.status,200);
 assert.equal(raw.headers.get("content-type"),"application/jwt");
 assert.match(raw.headers.get("cache-control"),/no-store/);
 assert.equal((await raw.text()).split(".").length,3);
});
test("reject unauthenticated internal requests, rate limits, and empty or throw source callbacks",async()=>{
 for(const input of [{allow:false},{rate:false},{throwOnRead:true},
  {customer:null},{quote:null},{link:null},{independent:false}]){
  const f=await fixture(input);
  const r=await f.source.handleRequest(req());
  assert.equal(r.status,403,JSON.stringify(input));
  assert.equal(await f.client.verifyCurrentCustomerOwnership(ids),false);
  if(input.allow===false||input.rate===false){
   assert.equal(f.calls.customer,0);
   assert.equal(f.calls.quote,0);
   assert.equal(f.calls.link,0);
  }
 }
});
test("wrong-tenant, nonactive customer, nonpublished/void quote and missing immutable terms deny",async()=>{
 const variants=[
  {customer:{...good.customer,tenantId:"tenantB"}},
  {customer:{...good.customer,state:"archived"}},
  {customer:{...good.customer,revoked:true}},
  {quote:{...good.quote,customerId:"otherCustomer"}},
  {quote:{...good.quote,state:"draft"}},
  {quote:{...good.quote,published:false}},
  {quote:{...good.quote,revoked:true}},
  {quote:{...good.quote,immutableFullTermsVerified:false}},
  {quote:{...good.quote,termsSha256:"invalid"}},
  {quote:{...good.quote,acceptanceVersion:0}},
  {link:{...good.link,tenantId:"otherTenant"}},
  {link:{...good.link,state:"revoked"}},
  {link:{...good.link,proofReferenceSha256:"bad"}},
  {link:{...good.link,provisionedByAuthorizedActor:false}}
 ];
 for(const v of variants){
  const f=await fixture(v);
  assert.equal((await f.source.handleRequest(req())).status,403,JSON.stringify(v));
  assert.equal(await f.client.verifyCurrentCustomerOwnership(ids),false);
 }
});
test("reject externally submitted scope, forged claims, incorrect method, content type or oversized input",async()=>{
 const f=await fixture();
 for(const body of [
  makeChallenge({tenantId:"tenantB"}),
  makeChallenge({customerId:"customerB"}),
  makeChallenge({quotationId:"quoteB"}),
  makeChallenge({linkId:"linkB"}),
  makeChallenge({email:"attack@example.com"}),
  makeChallenge({nonce:"bad"}),
  makeChallenge({audience:"employee"}),
  "not-json",
  "A".repeat(2000)
 ])assert.equal((await f.source.handleRequest(req(body))).status===200,false);
 const wrongMethod=new Request(scope.internalServiceUrl,{method:"GET"});
 assert.equal((await f.source.handleRequest(wrongMethod)).status,404);
 assert.equal((await f.source.handleRequest(req(makeChallenge(),
  {"content-type":"text/plain"}))).status,403);
 assert.equal((await f.source.handleRequest(new Request("https://evil.example/v1/ownership/check",{
  method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(makeChallenge())
 }))).status,404);
});
test("positive prior proof cannot be replayed for a different fresh nonce",async()=>{
 const f=await fixture();
 let remembered=null;
 const p=await keys();
 const consumer=createVerifier({
  enabled:true,environment:"essentials-private-staging",
  issuer,keyId,publicKey:p.publicKey,cryptoSubtle:subtle,
  sourceBinding:{fetch:async request=>{
   const signed=await f.source.handleRequest(request);
   if(!remembered){remembered=await signed.text();return new Response(remembered,{
    status:200,headers:{"content-type":"application/jwt"}
   })}
   return new Response(remembered,{status:200,headers:{"content-type":"application/jwt"}});
  }},
  randomBytes:(()=>{let n=1;return size=>new Uint8Array(size).fill(n++)})(),
  now:()=>nowMs
 });
 assert.equal(await consumer.verifyCurrentCustomerOwnership(ids),true);
 assert.equal(await consumer.verifyCurrentCustomerOwnership(ids),false);
});
