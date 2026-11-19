import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateOidcServerTokenHandoff as create,
 ESSENTIALS_PRIVATE_SAVE_OIDC_HANDOFF_SQL as SAVE,
 ESSENTIALS_PRIVATE_SELECT_OIDC_HANDOFF_SQL as SELECT,
 ESSENTIALS_PRIVATE_WIPE_OIDC_HANDOFF_SQL as WIPE,
 ESSENTIALS_PRIVATE_ASSERT_OIDC_HANDOFF_ERASURE_SQL as ASSERT_ERASE,
 ESSENTIALS_PRIVATE_EXPIRE_OIDC_HANDOFF_SQL as EXPIRE
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
function fixture({trusted=true,allowPost=true,allowCleanup=true,
 sessionActive=true,challengeActive=true,writeZero=false,
 failDb=false,failBatch=false}={}){
 let n=0,clock=at;
 const state={row:null,calls:[],batches:[],erasures:[],sessionActive,
  challengeActive,grants:[],cleanup:[],setClock:value=>{clock=value}};
 const db={prepare(sql){return {bind(...values){
   const stmt={sql,values};
   state.calls.push(stmt);
   return {...stmt,
    async run(){
     if(failDb)throw Error("unavailable");
     if(sql===SAVE){
      if(writeZero||state.row)return {success:true,meta:{changes:0}};
      const [keyHash,iv,cipher,issued,expires,sessionHash,tenant,actor,
       quote,challenge,customer]=values;
      state.row={handoff_key_sha256:keyHash,session_key_sha256:sessionHash,
       tenant_id:tenant,actor_user_id:actor,quotation_id:quote,
       challenge_id:challenge,customer_id:customer,token_iv:iv,
       token_ciphertext:cipher,issued_at_ms:issued,expires_at_ms:expires,
       state:"pending",consumed_at_ms:null,expired_at_ms:null};
      return {success:true,meta:{changes:1}};
     }
     if(sql===EXPIRE){
      const r=state.row;
      if(r?.state==="pending"&&r.expires_at_ms<=values[0]){
       r.state="expired";r.expired_at_ms=clock;r.token_iv=null;
       r.token_ciphertext=null;
       return {success:true,meta:{changes:1}};
      }
      return {success:true,meta:{changes:0}};
     }
     throw Error("unexpected query");
    }
   };
  }}},
  async batch(stmts){
   state.batches.push(stmts);
   if(failDb||failBatch)throw Error("transaction rolled back");
   if(stmts.length!==3||stmts[0].sql!==SELECT||
      stmts[1].sql!==WIPE||stmts[2].sql!==ASSERT_ERASE)
     throw Error("not atomic");
   const r=state.row,p=stmts[0].values,w=stmts[1].values,a=stmts[2].values;
   if(!r||r.state!=="pending"||r.expires_at_ms<=p[7]||
      r.handoff_key_sha256!==p[0]||r.session_key_sha256!==p[1]||
      r.tenant_id!==p[2]||r.actor_user_id!==p[3]||
      r.quotation_id!==p[4]||r.challenge_id!==p[5]||
      w[1]!==p[0]||w[2]!==p[1]||w[3]!==p[2]||
      w[4]!==p[3]||w[5]!==p[4]||w[6]!==p[5]||
      a[0]!==p[0]||a[1]!==p[1]||a[2]!==p[2]||
      a[3]!==p[3]||a[4]!==p[4]||a[5]!==p[5]||
      a[6]!==w[0])
    throw Error("mandatory SQL assertion abort");
   const old={...r};
   state.row={...r,state:"consumed",consumed_at_ms:w[0],
    token_iv:null,token_ciphertext:null};
   state.erasures.push({handoff_key_sha256:r.handoff_key_sha256,
    consumed_at_ms:w[0]});
   return [
    {success:true,results:[old]},
    {success:true,meta:{changes:1}},
    {success:true,meta:{changes:1}}
   ];
  }
 };
 const service=create({
  enabled:true,environment:"essentials-private-staging",db,
  tokenEncryptionKey:key,cryptoSubtle:webcrypto.subtle,now:()=>clock,
  randomBytes:size=>new Uint8Array(size).fill(++n),
  loadActiveSession:async({sessionKeyHash:given})=>
   given===sessionKeyHash&&state.sessionActive?{
    state:"active",tenantId:"tenantA",actorUserId:"actorA",
    expiresAtMs:at+180000}:null,
  loadSessionChallenge:async c=>
   state.challengeActive&&c.sessionKeyHash===sessionKeyHash&&
    c.tenantId==="tenantA"&&c.actorUserId==="actorA"&&
    c.quotationId==="quoteA"&&c.challengeId==="challengeA"?{
     state:"pending",tenantId:"tenantA",actorUserId:"actorA",
     quotationId:"quoteA",challengeId:"challengeA",
     customerId:"customerA",expiresAtMs:at+100000
    }:null,
  verifyTrustedOidcCompletion:async({claim:c,callbackResult:r})=>
   trusted&&c.sessionKeyHash===sessionKeyHash&&
    r.idToken===callbackResult.idToken,
  authorizeExplicitConsentPost:async c=>{
   state.grants.push(c);return allowPost;
  },
  authorizeExpiredHandoffCleanup:async c=>{
   state.cleanup.push(c);return allowCleanup;
  }
 });
 return {service,state};
}
const denial=async f=>assert.rejects(f(),/private_oidc_handoff_unverified/);
test("source-only service disabled and requires confidential cleanup authority",()=>{
 assert.throws(()=>create(),/private_oidc_handoff_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_oidc_handoff_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_oidc_handoff_unconfigured/);
});
test("one committed batch returns token ONLY to server after wiping ciphertext",async()=>{
 const h=fixture(),written=await h.service.recordOidcCallback(args);
 assert.deepEqual(written,{state:"server-held",challengeId:"challengeA",
  quotationId:"quoteA",expiresAtMs:at+100000});
 assert.equal("idToken" in written,false);
 assert.equal(JSON.stringify(h.state.calls).includes(callbackResult.idToken),false);
 assert.equal(h.state.row.state,"pending");
 assert.equal(h.state.row.token_iv.length,12);
 assert.ok(h.state.row.token_ciphertext.length>callbackResult.idToken.length);
 const returned=await h.service.consumeForExplicitAcceptance(claim);
 assert.deepEqual(returned,callbackResult);
 assert.equal(h.state.batches.length,1);
 assert.deepEqual(h.state.batches[0].map(x=>x.sql),[SELECT,WIPE,ASSERT_ERASE]);
 assert.equal(h.state.row.state,"consumed");
 assert.equal(h.state.row.token_iv,null);
 assert.equal(h.state.row.token_ciphertext,null);
 assert.equal(h.state.erasures.length,1);
 assert.equal(h.state.grants.length,1);
 await denial(()=>h.service.consumeForExplicitAcceptance(claim));
 assert.equal(h.state.erasures.length,1);
});
test("untrusted callback, wrong actor/session/customer, bad token never write",async()=>{
 for(const [opts,values] of [
  [{trusted:false},args],[{sessionActive:false},args],
  [{challengeActive:false},args],
  [{},{...args,sessionKeyHash:"b".repeat(64)}],
  [{},{sessionKeyHash,callbackResult:{...callbackResult,tenantId:"tenantB"}}],
  [{},{sessionKeyHash,callbackResult:{...callbackResult,challengeId:"other"}}],
  [{},{sessionKeyHash,callbackResult:{...callbackResult,idToken:"invalid"}}]
 ]){
  const h=fixture(opts);
  await denial(()=>h.service.recordOidcCallback(values));
  assert.equal(h.state.row,null);
 }
});
test("unauthorized consent POST cannot consume or wipe the token",async()=>{
 const h=fixture({allowPost:false});
 await h.service.recordOidcCallback(args);
 await denial(()=>h.service.consumeForExplicitAcceptance(claim));
 assert.equal(h.state.row.state,"pending");
 assert.ok(h.state.row.token_ciphertext);
 assert.equal(h.state.batches.length,0);
});
test("wrong actor, revoked session/challenge, failing batch fail closed without partial writes",async()=>{
 const h=fixture();await h.service.recordOidcCallback(args);
 for(const patch of [
  {sessionKeyHash:"b".repeat(64)},{tenantId:"tenantB"},
  {actorUserId:"actorB"},{quotationId:"quoteB"},{challengeId:"challengeB"}
 ])await denial(()=>h.service.consumeForExplicitAcceptance({...claim,...patch}));
 h.state.sessionActive=false;
 await denial(()=>h.service.consumeForExplicitAcceptance(claim));
 h.state.sessionActive=true;h.state.challengeActive=false;
 await denial(()=>h.service.consumeForExplicitAcceptance(claim));
 h.state.challengeActive=true;
 assert.equal(h.state.row.state,"pending");
 const broken=fixture({failBatch:true});
 await broken.service.recordOidcCallback(args);
 await denial(()=>broken.service.consumeForExplicitAcceptance(claim));
 assert.equal(broken.state.row.state,"pending");
 assert.ok(broken.state.row.token_ciphertext);
});
test("tamper after authenticated SELECT still fails sealed-decryption even after wipe",async()=>{
 for(const field of ["token_iv","token_ciphertext","customer_id"]){
  const h=fixture();await h.service.recordOidcCallback(args);
  if(field==="customer_id")h.state.row.customer_id="other";
  else h.state.row[field][0]^=1;
  await denial(()=>h.service.consumeForExplicitAcceptance(claim));
  assert.equal(h.state.row.state,"consumed");
  assert.equal(h.state.row.token_iv,null);
  assert.equal(h.state.row.token_ciphertext,null);
 }
});
test("authorized expiry cleanup wipes unused ciphertext but retains replay tombstone",async()=>{
 const h=fixture();await h.service.recordOidcCallback(args);
 h.state.setClock(at+100001);
 assert.deepEqual(await h.service.eraseExpiredHandoffs(),{expiredRowsErased:1});
 assert.equal(h.state.row.state,"expired");
 assert.equal(h.state.row.token_iv,null);
 assert.equal(h.state.row.token_ciphertext,null);
 assert.equal(h.state.row.expired_at_ms,at+100001);
 assert.equal((await h.service.eraseExpiredHandoffs()).expiredRowsErased,0);
 const restricted=fixture({allowCleanup:false});
 await restricted.service.recordOidcCallback(args);
 restricted.state.setClock(at+100001);
 await denial(()=>restricted.service.eraseExpiredHandoffs());
 assert.equal(restricted.state.row.state,"pending");
});
test("duplicate handoffs, failed persistence and missing database are denied",async()=>{
 const h=fixture();await h.service.recordOidcCallback(args);
 await denial(()=>h.service.recordOidcCallback(args));
 await denial(()=>fixture({writeZero:true}).service.recordOidcCallback(args));
 await denial(()=>fixture({failDb:true}).service.recordOidcCallback(args));
});
