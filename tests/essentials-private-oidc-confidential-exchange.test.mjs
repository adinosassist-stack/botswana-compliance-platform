import test from "node:test";
import assert from "node:assert/strict";
import {createEssentialsPrivateOidcConfidentialExchange} from
 "../server/essentials-private-oidc-confidential-exchange.mjs";

const ISSUER="https://id.private.example.test";
const ENDPOINT=ISSUER+"/token";
const REDIRECT="https://private-consent.example.test/oidc/callback";
const CLIENT="thebe-private-synthetic-client";
const SECRET="synthetic-private-client-secret-value";
const CODE="synthetic-authorization-code-123";
const VERIFIER="V".repeat(43);
const JWT=[
 Buffer.from('{"alg":"RS256","typ":"JWT","kid":"pinnedKey"}').toString("base64url"),
 Buffer.from('{"iss":"https://id.private.example.test","sub":"synthetic-customer","exp":9999999999}').toString("base64url"),
 Buffer.alloc(256,11).toString("base64url")
].join(".");
const args={code:CODE,codeVerifier:VERIFIER,tokenEndpoint:ENDPOINT,
 clientId:CLIENT,redirectUri:REDIRECT};
const good=()=>new Response(JSON.stringify({
 token_type:"Bearer",access_token:"do-not-return-access-token",
 expires_in:300,id_token:JWT
}),{status:200,headers:{"content-type":"application/json"}});
function fixture({response=good(),secret=SECRET,fetchFails=false}={}){
 const requests=[];let credentialsRead=0;
 const service=createEssentialsPrivateOidcConfidentialExchange({
  enabled:true,environment:"essentials-private-staging",
  issuer:ISSUER,clientId:CLIENT,tokenEndpoint:ENDPOINT,redirectUri:REDIRECT,
  getConfidentialClientSecret:async()=>{credentialsRead++;return secret},
  fetchToken:async request=>{
   requests.push(request);
   if(fetchFails)throw Error("transport request blocked");
   return response;
  }
 });
 return {service,requests,reads:()=>credentialsRead};
}
test("source-only exchange is disabled in production and requires pinned HTTPS endpoint",()=>{
 assert.throws(()=>createEssentialsPrivateOidcConfidentialExchange(),
  /private_oidc_exchange_disabled/);
 for(const override of [
  {environment:"production"},{issuer:"http://id.private.example.test"},
  {tokenEndpoint:"https://evil.test/token"},
  {tokenEndpoint:"https://id.private.example.test/token?redirect=https://evil.test"},
  {redirectUri:"http://private-consent.example.test/oidc/callback"}
 ]){
  const cfg={enabled:true,environment:"essentials-private-staging",
   issuer:ISSUER,clientId:CLIENT,tokenEndpoint:ENDPOINT,redirectUri:REDIRECT,
   getConfidentialClientSecret:async()=>SECRET,
   fetchToken:async()=>good(),...override};
  assert.throws(()=>createEssentialsPrivateOidcConfidentialExchange(cfg),
   /private_oidc_exchange_(disabled|unconfigured)/);
 }
});
test("confidential POST is URL pinned, no redirects, PKCE-bound and returns only unverified ID token",async()=>{
 const h=fixture();
 const result=await h.service.exchangeAuthorizationCode(args);
 assert.deepEqual(result,{idToken:JWT});
 assert.equal("access_token" in result,false);
 assert.equal(h.reads(),1);
 assert.equal(h.requests.length,1);
 const r=h.requests[0];
 assert.equal(r.url,ENDPOINT);
 assert.equal(r.method,"POST");
 assert.equal(r.redirect,"error");
 assert.equal(r.cache,"no-store");
 assert.equal(r.credentials,"omit");
 assert.equal(r.referrerPolicy,"no-referrer");
 assert.equal(r.headers.get("content-type"),"application/x-www-form-urlencoded");
 assert.equal(r.headers.get("accept"),"application/json");
 assert.equal(r.headers.get("authorization"),
  "Basic "+Buffer.from(CLIENT+":"+SECRET).toString("base64"));
 const body=new URLSearchParams(await r.text());
 assert.deepEqual([...body.keys()].sort(),[
  "code","code_verifier","grant_type","redirect_uri"
 ].sort());
 assert.equal(body.get("code"),CODE);
 assert.equal(body.get("code_verifier"),VERIFIER);
 assert.equal(body.get("grant_type"),"authorization_code");
 assert.equal(body.get("redirect_uri"),REDIRECT);
 assert.equal(body.toString().includes(SECRET),false);
 assert.equal(JSON.stringify(result).includes(SECRET),false);
});
test("caller cannot change issuer token endpoint, client ID, redirect or PKCE verifier",async()=>{
 for(const bad of [
  {tokenEndpoint:"https://evil.test/token"},
  {tokenEndpoint:ENDPOINT+"?not-allowed=1"},
  {clientId:"other-client"},
  {redirectUri:"https://evil.test/callback"},
  {code:"bad code"}, {code:""},
  {codeVerifier:"too-short"},
  {codeVerifier:"A".repeat(43)+"!"},
  {code:CODE+"!".repeat(3000)}
 ]){
  const h=fixture();
  await assert.rejects(h.service.exchangeAuthorizationCode({...args,...bad}),
   /private_oidc_exchange_unverified/);
  assert.equal(h.reads(),0);
  assert.equal(h.requests.length,0);
 }
});
test("credential retrieval is server-only and rejects unavailable or invalid secrets",async()=>{
 for(const secret of ["too-short","includes new\nline","",null]){
  const h=fixture({secret});
  await assert.rejects(h.service.exchangeAuthorizationCode(args),
   /private_oidc_exchange_unverified/);
  assert.equal(h.requests.length,0);
 }
});
test("redirects, wrong content-type, malformed JWT, OAuth errors and oversized JSON deny",async()=>{
 const scenarios=[
  new Response("",{status:302,headers:{location:"https://evil.test"}}),
  new Response(JSON.stringify({token_type:"Bearer",id_token:JWT}),
   {status:200,headers:{"content-type":"text/plain"}}),
  new Response(JSON.stringify({token_type:"bearer",id_token:"invalid"}),
   {status:200,headers:{"content-type":"application/json"}}),
  new Response(JSON.stringify({error:"invalid_grant",token_type:"Bearer",id_token:JWT}),
   {status:200,headers:{"content-type":"application/json"}}),
  new Response(JSON.stringify({token_type:"other",id_token:JWT}),
   {status:200,headers:{"content-type":"application/json"}}),
  new Response(JSON.stringify({token_type:"Bearer",id_token:JWT}),
   {status:500,headers:{"content-type":"application/json"}}),
  new Response("{broken JSON",{status:200,headers:{"content-type":"application/json"}}),
  new Response(JSON.stringify({token_type:"Bearer",id_token:JWT,
    filler:"X".repeat(20000)}),{status:200,headers:{"content-type":"application/json"}}),
 ];
 for(const response of scenarios){
  await assert.rejects(fixture({response}).service.exchangeAuthorizationCode(args),
   /private_oidc_exchange_unverified/);
 }
 await assert.rejects(fixture({fetchFails:true}).service.exchangeAuthorizationCode(args),
  /private_oidc_exchange_unverified/);
});
test("unexpected response URL fails even if transport violates pinned no-redirect policy",async()=>{
 const response=good();
 const object={status:response.status,redirected:false,url:"https://evil.test/redirect",
  headers:response.headers,body:response.body};
 await assert.rejects(fixture({response:object}).service.exchangeAuthorizationCode(args),
  /private_oidc_exchange_unverified/);
});
