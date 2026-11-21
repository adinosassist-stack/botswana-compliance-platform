import test from "node:test";
import assert from "node:assert/strict";
import {
 renderCustomerQuotation,
 createEssentialsPrivateCustomerStagingHttpGateway as create
} from "../server/essentials-private-customer-staging-http-gateway.mjs";
const origin="https://customer.private.test",te=new TextEncoder();
const quote=te.encode("Quotation Q-101 BWP 100.00 <script>alert('unsafe')</script>");
const terms=te.encode("Full terms: cancel & refund <img src=x onerror=alert(1)>");
const review={
 quotationId:"quoteA",quotationReference:"Q-101",
 presentationId:"presentationA",acceptanceVersion:2,totalMinor:10000,
 quotationSha256:"a".repeat(64),termsSha256:"b".repeat(64),
 immutableQuotationBytes:quote,immutableTermsBytes:terms
};
const nonce="N".repeat(32),oauthCookie="__Host-thebe-customer-oauth="+"Z".repeat(43);
function make({allow=true,withinLimit=true,denyReview=false,denyConsent=false,loginPatch={},callbackPatch={}}={}){
 const called={host:[],rate:[],login:[],callback:[],review:[],accept:[]};
 const journey={
  async beginCustomerLogin(x){
   called.login.push(x);
   return {authorizationUrl:"https://idp.private.test/authorize?state=test",
    setCookie:oauthCookie+"; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=300",...loginPatch};
  },
  async completeCustomerLogin(x){
   called.callback.push(x);
   return {
    quotationId:"quoteA",
    customerSetCookie:"__Host-thebe-customer="+"C".repeat(43)+
      "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=100",
    csrfSetCookie:"__Host-thebe-customer-csrf="+"S".repeat(43)+
      "; Secure; SameSite=Strict; Path=/; Max-Age=100",
    oauthClearCookie:"__Host-thebe-customer-oauth=; Secure; "+
      "HttpOnly; SameSite=Lax; Path=/; Max-Age=0",...callbackPatch
   };
  }
 };
 const boundary={async prepareCustomerReview(x){
  called.review.push(x);if(denyReview)throw Error("revoked");
  return {...review};
 }};
 const committer={async commitExplicitCustomerAcceptance(x){
  called.accept.push(x);if(denyConsent)throw Error("invalid csrf");
  return {state:"recorded",quotationId:"quoteA",acceptedAtMs:1234,
   acceptanceSha256:"f".repeat(64)};
 }};
 const gateway=create({
  enabled:true,environment:"essentials-private-staging",
  expectedOrigin:origin,journey,customerReviewBoundary:boundary,
  consentCommitter:committer,
  authorizeProtectedHostRequest:async x=>{
   called.host.push(x);return allow;
  },
  enforceCustomerRateLimit:async x=>{
   called.rate.push(x);return withinLimit;
  },
  makeCspNonce:async()=>nonce
 });
 return {gateway,called};
}
test("disabled default, environment isolation and fully wired access controls",()=>{
 assert.throws(()=>create(),/private_customer_staging_gateway_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_customer_staging_gateway_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_customer_staging_gateway_unconfigured/);
});
test("full immutable terms render without HTML injection, private no-store and separate explicit checkbox",()=>{
 const page=renderCustomerQuotation({review,nonce});
 assert.equal(page.headers["cache-control"],"private, no-store, max-age=0");
 assert.match(page.headers["content-security-policy"],/script-src 'nonce-N{32}'/);
 assert.match(page.html,/Full contractual terms/);
 assert.match(page.html,/BWP 100.00/);
 assert.match(page.html,/explicitly agree/);
 assert.match(page.html,/id="confirm" disabled/);
 assert.match(page.html,/id="decline"/);
 assert.equal(page.html.includes("<script>alert('unsafe')</script>"),false);
 assert.equal(page.html.includes("<img src=x onerror=alert(1)>"),false);
 assert.match(page.html,/&lt;script&gt;alert/);
 assert.match(page.html,/&lt;img src=x/);
 assert.equal(page.html.includes("linear-gradient("),false);
 assert.equal(page.html.includes("radial-gradient("),false);
 assert.equal(page.html.includes(oauthCookie),false);
});
test("fragment-ticket customer invitation landing has no tokens in served HTML and no-store CSP",async()=>{
 const h=make();
 const r=await h.gateway.handleRequest(new Request(
  origin+"/private/customer/invitations/inviteA"));
 assert.equal(r.status,200);
 assert.equal(r.headers.get("cache-control"),"private, no-store, max-age=0");
 assert.match(r.headers.get("content-security-policy"),/script-src 'nonce-N{32}'/);
 const page=await r.text();
 assert.match(page,/Verify your identity/);
 assert.match(page,/history.replaceState/);
 assert.match(page,/location.hash/);
 assert.match(page,/ticket/);
 assert.equal(page.includes("Q-101"),false);
 assert.equal(page.includes("__Host-thebe-consent"),false);
 assert.equal(h.called.login.length,0);
});
test("customer-only POST login issues private redirect with secure oauth cookie",async()=>{
 const h=make();
 const r=await h.gateway.handleRequest(new Request(
  origin+"/private/customer/invitations/inviteA/start",{
   method:"POST",headers:{
    "content-type":"application/json","origin":origin,
    "sec-fetch-site":"same-origin"
   },body:'{"ticket":"valid"}'
  }));
 assert.equal(r.status,200);
 assert.equal(r.headers.get("content-type"),"application/json; charset=utf-8");
 assert.match((await r.json()).authorizationUrl,/^https:\/\/idp.private.test\//);
 assert.match(r.headers.get("set-cookie"),/^__Host-thebe-customer-oauth=/);
 assert.equal(r.headers.get("cache-control"),"private, no-store, max-age=0");
 assert.equal(h.called.login.length,1);
});
test("customer OIDC callback issues separate customer and CSRF cookies",async()=>{
 const h=make();
 const r=await h.gateway.handleRequest(new Request(
  origin+"/private/customer/oidc/callback?code=c&state=s&iss=i"));
 assert.equal(r.status,303);
 assert.equal(r.headers.get("location"),"/private/customer/quotations/quoteA/review");
 const setCookie=r.headers.get("set-cookie");
 assert.match(setCookie,/__Host-thebe-customer=/);
 assert.match(setCookie,/__Host-thebe-customer-csrf=/);
 assert.match(setCookie,/__Host-thebe-customer-oauth=/);
 assert.equal(h.called.callback.length,1);
});
test("customer review and explicit acceptance are distinct and never read from employee sessions",async()=>{
 const h=make();
 const g=await h.gateway.handleRequest(new Request(
  origin+"/private/customer/quotations/quoteA/review",{
   headers:{cookie:"__Host-thebe-customer="+"C".repeat(43)}
  }));
 assert.equal(g.status,200);
 assert.equal(g.headers.get("content-type"),"text/html; charset=utf-8");
 assert.match(await g.text(),/Full contractual terms/);
 const p=await h.gateway.handleRequest(new Request(
  origin+"/private/customer/quotations/quoteA/accept",{
   method:"POST",headers:{"content-type":"application/json"},
   body:"{}"
  }));
 assert.equal(p.status,200);
 assert.equal((await p.json()).state,"recorded");
 assert.equal(h.called.review.length,1);
 assert.equal(h.called.accept.length,1);
 assert.equal(h.called.rate.length,2);
});
test("no private-host authorization, rate limit, wrong route or internal denial is fail closed",async()=>{
 for(const opts of [{allow:false},{withinLimit:false},{denyReview:true}]){
  const h=make(opts);
  const r=await h.gateway.handleRequest(new Request(
   origin+"/private/customer/quotations/quoteA/review"));
  assert.equal(r.status,opts.denyReview?403:403);
  assert.equal(h.called.review.length,opts.denyReview?1:0);
  assert.equal(r.headers.get("cache-control"),"private, no-store, max-age=0");
 }
 const h=make({denyConsent:true});
 const r=await h.gateway.handleRequest(new Request(
  origin+"/private/customer/quotations/quoteA/accept",{
   method:"POST",headers:{"content-type":"application/json"},body:"{}"
  }));
 assert.equal(r.status,403);
 assert.doesNotMatch(await r.text(),/quoteA|customerA|token|identity/i);
 const no=await h.gateway.handleRequest(new Request(
  origin+"/private/customer/quotations/quoteA/review?secret=xyz",{
   method:"DELETE"
  }));
 assert.equal(no.status,404);
});
test("invalid renderable quote bytes and missing full terms are denied, not silently omitted",()=>{
 for(const q of [
  {...review,immutableTermsBytes:new Uint8Array()},
  {...review,immutableQuotationBytes:Uint8Array.from([0,1,2])},
  {...review,termsSha256:"invalid"},
  {...review,presentationId:"/escaped"}
 ]){
  assert.throws(()=>renderCustomerQuotation({review:q,nonce}),
   /private_customer_staging_gateway_unverified/);
 }
});

test("login adapter cannot inject unsafe authorization destinations or cookies",async()=>{
 const base=origin+"/private/customer/invitations/inviteA/start";
 const request=()=>new Request(base,{method:"POST",headers:{
  "content-type":"application/json","origin":origin,"sec-fetch-site":"same-origin"
 },body:'{"ticket":"valid"}'});
 for(const loginPatch of [
  {authorizationUrl:"javascript:alert(1)"},
  {authorizationUrl:"https://attacker.test/authorize"},
  {authorizationUrl:"https://username:secret@idp.private.test/authorize?state=x"},
  {authorizationUrl:"https://idp.private.test/authorize?state=x#fragment"},
  {setCookie:"__Host-thebe-customer-oauth=evil; Path=/"},
  {setCookie:oauthCookie+"; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=300\r\nSet-Cookie: another=1"},
  {setCookie:oauthCookie+"; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"}
 ]){
  const h=make({loginPatch});
  const res=await h.gateway.handleRequest(request());
  assert.equal(res.status,403);
  assert.equal(res.headers.get("set-cookie"),null);
 }
});
test("callback cannot issue malformed or cross-purpose customer cookies",async()=>{
 const request=()=>new Request(origin+"/private/customer/oidc/callback?code=c&state=s&iss=i");
 for(const callbackPatch of [
  {customerSetCookie:"__Host-thebe-consent=malicious; Secure; HttpOnly; Path=/"},
  {csrfSetCookie:"__Host-thebe-customer-csrf=bad; Secure; SameSite=Lax; Path=/"},
  {oauthClearCookie:"__Host-thebe-customer-oauth=; Secure; Path=/; Max-Age=0"},
  {customerSetCookie:"__Host-thebe-customer="+"C".repeat(43)+"; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"}
 ]){
  const h=make({callbackPatch});
  const res=await h.gateway.handleRequest(request());
  assert.equal(res.status,403);
  assert.equal(res.headers.get("set-cookie"),null);
 }
});
