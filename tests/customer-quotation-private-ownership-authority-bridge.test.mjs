import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createC4TrustedCustomerOwnershipVerifier as createBridge,
 C4_CUSTOMER_OWNERSHIP_BRIDGE_CONTRACT as contract
} from "../server/essentials-private-customer-ownership-authority-bridge.mjs";

const subtle=webcrypto.subtle;
const issuer="https://authority.private.example";
const keyId="source-of-truth-test-1";
const nowMs=1795190400000;
const scope=Object.freeze({
 tenantId:"tenantA",customerId:"customerA",
 quotationId:"quoteA",linkId:"linkA"
});
const to64=x=>btoa(String.fromCharCode(...x))
 .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const enc=x=>to64(new TextEncoder().encode(JSON.stringify(x)));
let keyPair;
async function keys(){
 if(!keyPair)keyPair=await subtle.generateKey({
  name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"
 },false,["sign","verify"]);
 return keyPair;
}
async function signed({challenge,privateKey,header={},claims={}}){
 const h=enc({alg:"RS256",typ:"thebe-customer-ownership+jwt",kid:keyId,...header});
 const body=enc({
  iss:issuer,aud:contract.audience,
  iat:Math.floor(nowMs/1000),exp:Math.floor(nowMs/1000)+25,
  nonce:challenge.nonce,tenant_id:challenge.tenantId,
  customer_id:challenge.customerId,
  quotation_id:challenge.quotationId,link_id:challenge.linkId,
  ownership:"current",quotation_state:"accepted",
  ...claims
 });
 const signature=await subtle.sign("RSASSA-PKCS1-v1_5",privateKey,
  new TextEncoder().encode(h+"."+body));
 return h+"."+body+"."+to64(new Uint8Array(signature));
}
function setup({mutateClaims,mutateHeader,reply,throwTransport=false}={}){
 let requests=[],calls=0;
 const binding={
  async fetch(request){
   calls++;
   requests.push(request);
   if(throwTransport)throw Error("private source unreachable");
   const parsed=JSON.parse(await request.text());
   const pair=await keys();
   const claims=typeof mutateClaims==="function"?mutateClaims(parsed):{};
   const header=typeof mutateHeader==="function"?mutateHeader(parsed):{};
   const jwt=await signed({challenge:parsed,privateKey:pair.privateKey,
    claims,header});
   return typeof reply==="function"?reply({jwt,request,parsed}):
    new Response(jwt,{status:200,headers:{
     "content-type":"application/jwt","cache-control":"no-store"
    }});
  }
 };
 let nonce=0;
 return {
  binding,requests,get calls(){return calls;},
  async verify(override=scope){
   const p=await keys();
   return createBridge({
    enabled:true,environment:"essentials-private-staging",
    issuer,keyId,publicKey:p.publicKey,sourceBinding:binding,
    cryptoSubtle:subtle,
    randomBytes:n=>new Uint8Array(n).fill(++nonce),
    now:()=>nowMs
   }).verifyCurrentCustomerOwnership(override);
  }
 };
}
test("real signed private ownership attestation verifies exact customer and quote scope",async()=>{
 const h=setup();
 assert.equal(await h.verify(),true);
 assert.equal(h.calls,1);
 const r=h.requests[0];
 assert.equal(r.method,"POST");
 assert.equal(new URL(r.url).hostname,"c4-internal-customer-authority.invalid");
 assert.equal(r.headers.get("accept"),"application/jwt");
 assert.equal(r.headers.get("cache-control"),"no-store");
 assert.equal(r.credentials,"omit");
 assert.equal(r.redirect,"error");
 assert.equal(contract.usesProductionD1Directly,false);
 assert.equal(contract.usesGlobalFetch,false);
 assert.equal(contract.publicCustomerLoginEnabled,false);
 assert.equal(contract.cloudMutationAuthorized,false);
});
test("must be enabled explicitly with pinned source binding and 2048-bit+ verification key",async()=>{
 const pair=await keys();
 const h=setup();
 assert.throws(()=>createBridge(),/c4_customer_authority_disabled/);
 assert.throws(()=>createBridge({enabled:true,environment:"essentials-private-staging"}),/c4_customer_authority_unconfigured/);
 assert.throws(()=>createBridge({
  enabled:true,environment:"production",sourceBinding:h.binding,
  issuer,keyId,publicKey:pair.publicKey
 }),/c4_customer_authority_disabled/);
 assert.throws(()=>createBridge({
  enabled:true,environment:"essentials-private-staging",
  sourceBinding:null,issuer,keyId,publicKey:pair.publicKey
 }),/c4_customer_authority_unconfigured/);
 assert.throws(()=>createBridge({
  enabled:true,environment:"essentials-private-staging",
  sourceBinding:h.binding,issuer:"http://authority.private.example",
  keyId,publicKey:pair.publicKey
 }),/c4_customer_authority_unconfigured/);
});
test("never call private source for absent or malformed tenant/customer/quote/link",async()=>{
 const h=setup();
 for(const partial of [
  {...scope,tenantId:"tenant/a"}, {...scope,customerId:""},
  {...scope,quotationId:"quote?x"}, {...scope,linkId:null},
  {tenantId:scope.tenantId,customerId:scope.customerId,quotationId:scope.quotationId}
 ]) assert.equal(await h.verify(partial),false);
 assert.equal(h.calls,0);
});
test("cross-tenant, wrong customer, wrong quote, wrong identity link and revoked proof DENY",async()=>{
 const mutations=[
  {tenant_id:"tenantB"},{customer_id:"customerB"},
  {quotation_id:"quoteB"},{link_id:"linkB"},
  {ownership:"revoked"},{quotation_state:"void"}
 ];
 for(const variant of mutations){
  const h=setup({mutateClaims:()=>variant});
  assert.equal(await h.verify(),false,JSON.stringify(variant));
 }
});
test("future/stale/expired and overlong signed proof DENY",async()=>{
 const second=Math.floor(nowMs/1000);
 for(const claims of [
  {iat:second+5,exp:second+15},
  {iat:second-40,exp:second+10},
  {iat:second-5,exp:second},
  {iat:second-1,exp:second+90},
  {exp:"later"}
 ]){
  const h=setup({mutateClaims:()=>claims});
  assert.equal(await h.verify(),false,JSON.stringify(claims));
 }
});
test("wrong algorithm, key ID, unsigned and unrecognized claim DENY",async()=>{
 for(const header of [
  {alg:"none"},{alg:"HS256"},{kid:"unexpected"},{typ:"JWT"},{extra:"injected"}
 ]){
  const h=setup({mutateHeader:()=>header});
  assert.equal(await h.verify(),false,JSON.stringify(header));
 }
 const h=setup({mutateClaims:()=>({email:"attacker@example.org"})});
 assert.equal(await h.verify(),false);
});
test("attacker signature, bearer replay and no private authority source DENY",async()=>{
 let previous=null;
 const source=setup({
  reply:({jwt})=>{
   const returned=previous||jwt;
   previous=jwt;
   return new Response(returned,{headers:{"content-type":"application/jwt"}});
  }
 });
 assert.equal(await source.verify(),true);
 assert.equal(await source.verify(),false,"old signed nonce cannot authorize a new attempt");
 const bad=setup({reply:({jwt})=>{
  const a=jwt.split(".");
  a[2]=to64(new Uint8Array(256).fill(1));
  return new Response(a.join("."),{headers:{"content-type":"application/jwt"}});
 }});
 assert.equal(await bad.verify(),false);
 const down=setup({throwTransport:true});
 assert.equal(await down.verify(),false);
});
test("fail-closed on non-200, redirects, wrong content type and excessive body",async()=>{
 const badReplies=[
  ()=>new Response("no",{status:403,headers:{"content-type":"application/jwt"}}),
  ()=>new Response("no",{status:302,headers:{"content-type":"application/jwt","location":"https://evil.example"}}),
  ()=>new Response("no",{status:200,headers:{"content-type":"text/html"}}),
  ()=>new Response("A".repeat(8200),{status:200,headers:{"content-type":"application/jwt"}})
 ];
 for(const reply of badReplies){
  const h=setup({reply});
  assert.equal(await h.verify(),false);
 }
});
test("a signed attestation is not a deployment grant or real customer identity setup",async()=>{
 const h=setup();
 assert.equal(await h.verify(),true);
 assert.equal(contract.sourceProvisioned,false);
 assert.equal(contract.publicCustomerLoginEnabled,false);
 assert.equal(contract.cloudMutationAuthorized,false);
});
