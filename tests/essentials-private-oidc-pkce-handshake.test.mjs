import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createEssentialsPrivateOidcPkceHandshake} from
 "../server/essentials-private-oidc-pkce-handshake.mjs";

const subtle=webcrypto.subtle;
const ISSUER="https://id.private.example.test";
const AUTH=ISSUER+"/authorize",TOKEN=ISSUER+"/token";
const REDIRECT="https://private-consent.example.test/oidc/callback";
const CLIENT="thebe-private-synthetic-client";
const SESSION="a".repeat(64),OTHER_SESSION="b".repeat(64);
const at=Date.parse("2026-11-19T18:30:00Z");
const principal={tenantId:"tenantA",userId:"actorA"};
const args={principal,quotationId:"quoteA",challengeId:"challengeA",
 sessionKeyHash:SESSION};
const nonce="N".repeat(43);
const fakeIdToken=[
 Buffer.from('{"alg":"RS256","typ":"JWT"}').toString("base64url"),
 Buffer.from('{"iss":"https://id.private.example.test","sub":"subjectA"}').toString("base64url"),
 "signature-not-verified-by-this-protocol-adapter"
].join(".");
const hex=async s=>[...new Uint8Array(await subtle.digest("SHA-256",
 new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,"0")).join("");
function setup({
 sessionOK=true,challengeOK=true,challengeNonce=nonce,challengeCustomer="customerA",
 persistOK=true,exchangeFails=false,exchangeToken=fakeIdToken,
 clock=()=>at,expiredAttempt=false
}={}){
 const events={session:[],bound:[],saved:[],consumed:[],exchange:[]};
 const db=new Map();let rng=0;
 let live=challengeOK,activeNonce=challengeNonce,activeCustomer=challengeCustomer;
 const flow=createEssentialsPrivateOidcPkceHandshake({
  enabled:true,environment:"essentials-private-staging",
  issuer:ISSUER,clientId:CLIENT,
  authorizationEndpoint:AUTH,tokenEndpoint:TOKEN,
  redirectUri:REDIRECT,cryptoSubtle:subtle,now:clock,
  randomBytes:size=>new Uint8Array(size).fill(++rng),
  verifyActiveSession:async claim=>{
   events.session.push(claim);return sessionOK;
  },
  loadBoundChallenge:async claim=>{
   events.bound.push(claim);
   return {state:live?"pending":"revoked",
    challengeId:"challengeA",tenantId:"tenantA",
    actorUserId:"actorA",quotationId:"quoteA",
    customerId:activeCustomer,nonce:activeNonce,
    expiresAtMs:at+120000};
  },
  persistAuthorizationAttempt:async attempt=>{
   events.saved.push(attempt);
   if(!persistOK||db.has(attempt.stateSha256))return false;
   db.set(attempt.stateSha256,{...attempt,state:"pending"});
   return true;
  },
  consumeAuthorizationAttempt:async input=>{
   events.consumed.push(input);
   const record=db.get(input.stateSha256);
   if(!record||record.state!=="pending"||
      record.sessionKeyHash!==input.sessionKeyHash)return null;
   record.state="consumed";
   return {...record,expiresAtMs:expiredAttempt?at-1:record.expiresAtMs};
  },
  exchangeAuthorizationCode:async input=>{
   events.exchange.push(input);
   if(exchangeFails)throw Error("exchange blocked");
   return {idToken:exchangeToken,access_token:"never-return-access-token"};
  }
 });
 return {flow,events,revokeChallenge:()=>{live=false},
  changeNonce:x=>{activeNonce=x},changeCustomer:x=>{activeCustomer=x}};
}
const callUrl=(authorizeUrl,{code="code-synthetic-123",issuer=ISSUER,change}={})=>{
 const a=new URL(authorizeUrl);
 const url=new URL(REDIRECT);
 url.searchParams.set("code",code);
 url.searchParams.set("state",a.searchParams.get("state"));
 url.searchParams.set("iss",issuer);
 if(change)change(url);
 return url.href;
};
test("off by default, HTTPS pinned IdP endpoints and private callbacks required",()=>{
 assert.throws(()=>createEssentialsPrivateOidcPkceHandshake(),
  /private_oidc_handshake_disabled/);
 for(const override of [
  {environment:"production"}, {issuer:"http://id.private.example.test"},
  {authorizationEndpoint:"https://attacker.test/authorize"},
  {tokenEndpoint:"https://attacker.test/token"},
  {redirectUri:"http://private-consent.example.test/oidc/callback"}
 ]){
  const c={enabled:true,environment:"essentials-private-staging",
    issuer:ISSUER,clientId:CLIENT,authorizationEndpoint:AUTH,
    tokenEndpoint:TOKEN,redirectUri:REDIRECT,
    randomBytes:()=>new Uint8Array(32).fill(1),
    verifyActiveSession:async()=>true,loadBoundChallenge:async()=>null,
    persistAuthorizationAttempt:async()=>true,
    consumeAuthorizationAttempt:async()=>null,
    exchangeAuthorizationCode:async()=>null,...override};
  assert.throws(()=>createEssentialsPrivateOidcPkceHandshake(c),
   /private_oidc_handshake_(disabled|unconfigured)/);
 }
});
test("begin stores only a hashed opaque state, a bound PKCE verifier and server nonce hash",async()=>{
 const h=setup();
 const created=await h.flow.begin(args);
 const auth=new URL(created.authorizationUrl);
 assert.equal(auth.origin,new URL(ISSUER).origin);
 assert.equal(auth.pathname,"/authorize");
 for(const [field,expected] of [
  ["response_type","code"],["client_id",CLIENT],
  ["redirect_uri",REDIRECT],["scope","openid"],["prompt","login"],
  ["max_age","0"],["code_challenge_method","S256"],["nonce",nonce]
 ])assert.equal(auth.searchParams.get(field),expected);
 const state=auth.searchParams.get("state");
 assert.match(state,/^[A-Za-z0-9_-]{43}$/);
 const row=h.events.saved[0];
 assert.equal(row.stateSha256,await hex(state));
 assert.equal(row.nonceSha256,await hex(nonce));
 assert.equal(row.sessionKeyHash,SESSION);
 assert.equal(row.tenantId,"tenantA");
 assert.equal(row.customerId,"customerA");
 assert.match(row.codeVerifier,/^[A-Za-z0-9_-]{43}$/);
 assert.notEqual(row.codeVerifier,state);
 const actualChallenge=Buffer.from(await subtle.digest("SHA-256",
  new TextEncoder().encode(row.codeVerifier))).toString("base64url");
 assert.equal(auth.searchParams.get("code_challenge"),actualChallenge);
 assert.equal(auth.href.includes(row.codeVerifier),false);
 assert.equal(auth.href.includes(SESSION),false);
 assert.equal(created.expiresAtMs,at+120000);
});
test("callback consumes state atomically before exchange, verifies session nonce, and returns only unverified server token",async()=>{
 const h=setup();
 const created=await h.flow.begin(args);
 const input={method:"GET",callbackUrl:callUrl(created.authorizationUrl),
  sessionKeyHash:SESSION};
 const response=await h.flow.complete(input);
 assert.equal(response.idToken,fakeIdToken);
 assert.deepEqual({tenantId:response.tenantId,actorUserId:response.actorUserId,
  quotationId:response.quotationId,challengeId:response.challengeId},
  {tenantId:"tenantA",actorUserId:"actorA",
   quotationId:"quoteA",challengeId:"challengeA"});
 assert.equal("access_token" in response,false);
 assert.equal(h.events.consumed.length,1);
 assert.equal(h.events.exchange.length,1);
 assert.equal(h.events.exchange[0].tokenEndpoint,TOKEN);
 assert.equal(h.events.exchange[0].clientId,CLIENT);
 assert.equal(h.events.exchange[0].redirectUri,REDIRECT);
 assert.equal(h.events.exchange[0].code,"code-synthetic-123");
 assert.equal(h.events.exchange[0].codeVerifier,h.events.saved[0].codeVerifier);
 await assert.rejects(h.flow.complete(input),/private_oidc_handshake_unverified/);
 assert.equal(h.events.exchange.length,1);
});
test("missing or altered signed response issuer, duplicate state, extra fields, wrong path fail before consuming",async()=>{
 const invalid=[
  {change:u=>u.searchParams.delete("iss")},
  {issuer:"https://evil.test"},
  {change:u=>u.searchParams.append("state",u.searchParams.get("state"))},
  {change:u=>u.searchParams.append("code","second-code")},
  {change:u=>u.searchParams.append("error","access_denied")},
  {change:u=>u.searchParams.set("code","in valid")},
  {change:u=>u.pathname="/oidc/wrong"},
  {change:u=>u.hash="fragment"},
  {change:u=>u.searchParams.set("state","invalid")},
  {change:u=>u.searchParams.delete("state")}
 ];
 for(const attack of invalid){
  const h=setup(),start=await h.flow.begin(args);
  await assert.rejects(h.flow.complete({
    method:"GET",callbackUrl:callUrl(start.authorizationUrl,attack),
    sessionKeyHash:SESSION
  }),/private_oidc_handshake_unverified/);
  assert.equal(h.events.consumed.length,0);
  assert.equal(h.events.exchange.length,0);
 }
});
test("wrong session, expired or revoked attempt, changed challenge nonce and failed exchange deny",async()=>{
 for(const scenario of ["wrong-session","expired-attempt","revoked-challenge",
  "nonce-changed","customer-changed","exchange-failure","malformed-token"]){
  const options={
    expiredAttempt:scenario==="expired-attempt",
    challengeNonce:scenario==="nonce-changed"?"X".repeat(43):nonce,
    challengeCustomer:scenario==="customer-changed"?"customerB":"customerA",
    exchangeFails:scenario==="exchange-failure",
    exchangeToken:scenario==="malformed-token"?"not-a-jwt":fakeIdToken
  };
  const h=setup({
    expiredAttempt:options.expiredAttempt,
    exchangeFails:options.exchangeFails,
    exchangeToken:options.exchangeToken
  });
  const start=await h.flow.begin(args);
  if(scenario==="revoked-challenge")h.revokeChallenge();
  if(scenario==="nonce-changed")h.changeNonce("X".repeat(43));
  if(scenario==="customer-changed")h.changeCustomer("customerB");
  const sessionKeyHash=scenario==="wrong-session"?OTHER_SESSION:SESSION;
  await assert.rejects(h.flow.complete({
   method:"GET",callbackUrl:callUrl(start.authorizationUrl),sessionKeyHash
  }),/private_oidc_handshake_unverified/);
  if(scenario==="wrong-session")assert.equal(h.events.exchange.length,0);
 }
});
test("session denial, challenge revocation and persistence failure deny before returning a redirect",async()=>{
 for(const opts of [{sessionOK:false},{challengeOK:false},{persistOK:false}]){
  const h=setup(opts);
  await assert.rejects(h.flow.begin(args),/private_oidc_handshake_unverified/);
 }
 for(const input of [
  {...args,sessionKeyHash:"not-hash"},
  {...args,principal:{...principal,userId:"../bad"}},
  {...args,challengeId:""},
  {...args,quotationId:"quote/other"}
 ]){
  await assert.rejects(setup().flow.begin(input),/private_oidc_handshake_unverified/);
 }
});
