import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateOidcServerTokenHandoff as create,
 ESSENTIALS_PRIVATE_SAVE_OIDC_HANDOFF_SQL as SAVE,
 ESSENTIALS_PRIVATE_CONSUME_OIDC_HANDOFF_SQL as CONSUME
} from "../server/essentials-private-oidc-server-handoff.mjs";
const key=await webcrypto.subtle.generateKey(
 {name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const at=Date.parse("2026-11-19T20:00:00Z");
const sessionKeyHash="a".repeat(64);
const callbackResult={
 tenantId:"tenantA",actorUserId:"actorA",quotationId:"quoteA",
 challengeId:"challengeA",idToken:["e".repeat(24),"f".repeat(48),"g".repeat(100)].join(".")
};
const claim={sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA",
 quotationId:"quoteA",challengeId:"challengeA"};
const args={sessionKeyHash,callbackResult};
function fixture({trusted=true,allowPost=true,sessionActive=true,
 challengeActive=true,writeZero=false,throwDb=false,now=()=>at}={}){
 let tokenId=0;
 const state={row:null,calls:[],checks:[],grants:[],sessionActive,challengeActive};
 const db={prepare(sql){return {bind(...values){state.calls.push({sql,values});return {
  async run(){
   if(throwDb)throw Error("D1 unavailable");
   if(sql!==SAVE)throw Error("wrong SAVE");
   if(writeZero||state.row)return {success:true,meta:{changes:0}};
   const [keyHash,iv,cipher,issued,expires,sessionHash,tenant,actor,quote,challenge,customer]=values;
   state.row={handoff_key_sha256:keyHash,session_key_sha256:sessionHash,
    tenant_id:tenant,actor_user_id:actor,quotation_id:quote,
    challenge_id:challenge,customer_id:customer,
    token_iv:iv,token_ciphertext:cipher,issued_at_ms:issued,
    expires_at_ms:expires,state:"pending"};
   return {success:true,meta:{changes:1}};
  },
  async first(){
   if(throwDb)throw Error("D1 unavailable");
   if(sql!==CONSUME)throw Error("wrong CONSUME");
   const r=state.row;
   if(!r||r.state!=="pending"||r.handoff_key_sha256!==values[1]||
      r.session_key_sha256!==values[2]||r.tenant_id!==values[3]||
      r.actor_user_id!==values[4]||r.quotation_id!==values[5]||
      r.challenge_id!==values[6]||r.expires_at_ms<=values[8])return null;
   r.state="consumed";return {...r};
  }
 }}}}};
 const service=create({
  enabled:true,environment:"essentials-private-staging",db,
  tokenEncryptionKey:key,cryptoSubtle:webcrypto.subtle,now,
  randomBytes:n=>new Uint8Array(n).fill(++tokenId),
  loadActiveSession:async({sessionKeyHash:given})=>
   given===sessionKeyHash&&state.sessionActive?{
    state:"active",tenantId:"tenantA",actorUserId:"actorA",
    expiresAtMs:at+180000}:null,
  loadSessionChallenge:async c=>{
   state.checks.push(c);
   return state.challengeActive&&c.sessionKeyHash===sessionKeyHash&&
    c.tenantId==="tenantA"&&c.actorUserId==="actorA"&&
    c.quotationId==="quoteA"&&c.challengeId==="challengeA"?{
     state:"pending",tenantId:"tenantA",actorUserId:"actorA",
     quotationId:"quoteA",challengeId:"challengeA",
     customerId:"customerA",expiresAtMs:at+100000
    }:null;
  },
  verifyTrustedOidcCompletion:async({claim,callbackResult})=>
   trusted&&claim.sessionKeyHash===sessionKeyHash&&
    callbackResult.idToken===callbackResultFromTrustedHost,
  authorizeExplicitConsentPost:async c=>{
   state.grants.push(c);return allowPost;
  }
 });
 return {service,state};
}
const callbackResultFromTrustedHost=callbackResult.idToken;
const denial=async f=>assert.rejects(f(),/private_oidc_handoff_unverified/);
test("isolated service stays disabled and requires nonextractable AES-GCM 256 key",async()=>{
 assert.throws(()=>create(),/private_oidc_handoff_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_oidc_handoff_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_oidc_handoff_unconfigured/);
});
test("server-only callback token is encrypted and session/challenge-bound, never returned",async()=>{
 const h=fixture();const output=await h.service.recordOidcCallback(args);
 assert.deepEqual(output,{state:"server-held",challengeId:"challengeA",
  quotationId:"quoteA",expiresAtMs:at+100000});
 assert.equal("idToken" in output,false);
 const [write]=h.state.calls;
 assert.equal(write.sql,SAVE);
 assert.equal(write.values.length,13);
 assert.equal(write.values[1].length,12);
 assert.ok(write.values[2].length>callbackResult.idToken.length);
 assert.equal(JSON.stringify(write).includes(callbackResult.idToken),false);
 assert.equal(h.state.row.state,"pending");
 assert.equal(h.state.row.customer_id,"customerA");
 const first=await h.service.consumeForExplicitAcceptance(claim);
 assert.deepEqual(first,{...callbackResult});
 assert.equal(h.state.row.state,"consumed");
 assert.equal(h.state.grants.length,1);
 assert.equal(await h.service.consumeForExplicitAcceptance(claim),null);
 assert.equal(h.state.calls.filter(x=>x.sql===CONSUME).length,2);
});
test("untrusted OIDC completion, wrong session, tenant, quote and challenge deny storage",async()=>{
 for(const [opts,values] of [
  [{trusted:false},args],
  [{sessionActive:false},args],
  [{challengeActive:false},args],
  [{},{...args,sessionKeyHash:"b".repeat(64)}],
  [{},{sessionKeyHash,callbackResult:{...callbackResult,tenantId:"tenantB"}}],
  [{},{sessionKeyHash,callbackResult:{...callbackResult,challengeId:"other"}}],
  [{},{sessionKeyHash,callbackResult:{...callbackResult,idToken:"not a JWT"}}]
 ]){
  const h=fixture(opts);await denial(()=>h.service.recordOidcCallback(values));
  assert.equal(h.state.row,null);
 }
});
test("without explicit authorized POST the token is not consumed",async()=>{
 const h=fixture({allowPost:false});await h.service.recordOidcCallback(args);
 await denial(()=>h.service.consumeForExplicitAcceptance(claim));
 assert.equal(h.state.row.state,"pending");
 assert.equal(h.state.calls.filter(x=>x.sql===CONSUME).length,0);
});
test("revoked session or challenge, wrong actor and expired handoff deny",async()=>{
 const h=fixture();await h.service.recordOidcCallback(args);
 for(const changes of [{sessionKeyHash:"b".repeat(64)},
  {tenantId:"tenantB"},{actorUserId:"actorB"},
  {quotationId:"quoteB"},{challengeId:"challengeB"}]){
  await denial(()=>h.service.consumeForExplicitAcceptance({...claim,...changes}));
 }
 h.state.sessionActive=false;
 await denial(()=>h.service.consumeForExplicitAcceptance(claim));
 h.state.sessionActive=true;h.state.challengeActive=false;
 await denial(()=>h.service.consumeForExplicitAcceptance(claim));
 h.state.challengeActive=true;
 h.state.row.expires_at_ms=at-1;
 assert.equal(await h.service.consumeForExplicitAcceptance(claim),null);
});
test("AES-GCM tampering fails closed even after one-time consumption",async()=>{
 for(const field of ["token_iv","token_ciphertext","customer_id"]){
  const h=fixture();await h.service.recordOidcCallback(args);
  if(field==="customer_id")h.state.row.customer_id="other";
  else h.state.row[field][0]^=1;
  await denial(()=>h.service.consumeForExplicitAcceptance(claim));
  assert.equal(h.state.row.state,"consumed");
 }
});
test("duplicate callback and failed D1 persistence never yield a handoff",async()=>{
 const h=fixture();await h.service.recordOidcCallback(args);
 await denial(()=>h.service.recordOidcCallback(args));
 for(const opts of [{writeZero:true},{throwDb:true}]){
  await denial(()=>fixture(opts).service.recordOidcCallback(args));
 }
 await denial(()=>fixture({throwDb:true}).service.consumeForExplicitAcceptance(claim));
});
