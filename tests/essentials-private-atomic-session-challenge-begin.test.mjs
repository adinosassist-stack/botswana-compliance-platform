import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateAtomicSessionChallengeBegin as create,
 ESSENTIALS_PRIVATE_ATOMIC_BEGIN_READ_QUOTE_SQL as READ,
 ESSENTIALS_PRIVATE_ASSERT_ATOMIC_BEGIN_SQL as ASSERT
} from "../server/essentials-private-atomic-session-challenge-begin.mjs";
import {ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL as CHALLENGE} from
 "../server/essentials-private-one-time-consent-store.mjs";
import {ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL as BIND} from
 "../server/essentials-private-session-quotation-challenge-binding.mjs";
const at=Date.parse("2026-11-19T19:20:00Z");
const subtle=webcrypto.subtle;
const key=await subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const principal={tenantId:"tenantA",userId:"actorA"};
const hash="a".repeat(64);
const quote={tenant_id:"tenantA",quotation_id:"quoteA",customer_id:"customerA",
 quotation_reference:"Q-101",acceptance_version:2,total_minor:10000,
 quotation_sha256:"b".repeat(64)};
const args={principal,sessionKeyHash:hash,quotationId:"quoteA"};
function fixture({allow=true,sessionValid=true,sessionExpires=at+120000,
 quoted=true,batchFault=null,brokenDb=false}={}){
 const calls={queries:[],batches:[],authority:[],dbState:[]};
 let n=0;
 const db={
  prepare(sql){return {bind(...values){return {
   sql,args:values,
   async first(){calls.queries.push({sql,args:values});
    if(brokenDb)throw Error("db down");
    if(sql!==READ)throw Error("unexpected read");
    return quoted?{...quote}:null;
   }
  }}}},
  async batch(statements){
   calls.batches.push(statements);
   if(brokenDb)throw Error("db down");
   if(statements.length!==3||statements[0].sql!==CHALLENGE||
      statements[1].sql!==BIND||statements[2].sql!==ASSERT)
    throw Error("incorrect batch");
   // Pretend a D1 SQL BEGIN/COMMIT. An exception in the final ASSERT
   // rolls the earlier INSERTs back; this is verified with actual SQLite
   // in tests/essentials_private_atomic_session_begin_sqlite.py.
   if(batchFault)throw Error("transaction rolled back");
   calls.dbState.push("challenge","binding","audit");
   return statements.map(()=>({success:true,meta:{changes:1}}));
  }
 };
 const store=create({
  enabled:true,environment:"essentials-private-staging",db,
  nonceEncryptionKey:key,cryptoSubtle:subtle,now:()=>at,
  loadActiveSession:async()=>sessionValid?{
   state:"active",tenantId:"tenantA",actorUserId:"actorA",
   expiresAtMs:sessionExpires}:null,
  authorizeHostSession:async request=>{
   calls.authority.push(request);return allow;
  },
  randomUUID:()=> "challengeA",
  randomBytes:size=>new Uint8Array(size).fill(++n)
 });
 return {store,calls};
}
test("candidate disabled by default and requires a complete protected batch plus nonextractable key",()=>{
 assert.throws(()=>create(),/private_atomic_quote_begin_disabled/);
 assert.throws(()=>create({enabled:true,environment:"production"}),
  /private_atomic_quote_begin_disabled/);
 assert.throws(()=>create({enabled:true,environment:"essentials-private-staging"}),
  /private_atomic_quote_begin_unconfigured/);
});
test("one batch includes guarded insert, encrypted bind and unconditional audit assertion",async()=>{
 const h=fixture();
 const result=await h.store.beginBoundChallenge(args);
 assert.deepEqual(result,{challengeId:"challengeA",tenantId:"tenantA",
  quotationId:"quoteA",customerId:"customerA",expiresAtMs:at+120000});
 assert.deepEqual(h.calls.authority,[{
  principal,sessionKeyHash:hash,quotationId:"quoteA",
  action:"begin-bound-challenge"
 }]);
 assert.deepEqual(h.calls.queries[0].args,[
  "tenantA","quoteA","tenantA","quoteA"
 ]);
 const [ch,b,assertion]=h.calls.batches[0];
 assert.deepEqual(ch.args,[
  "challengeA","actorA",ch.args[2],at,at+300000,
  "tenantA","quoteA"
 ]);
 assert.match(ch.args[2],/^[0-9a-f]{64}$/);
 assert.equal(b.args[0].length,12);
 assert.ok(b.args[1].length>43);
 assert.deepEqual(b.args.slice(2),[
  "challengeA",hash,"quoteA",ch.args[2],at,at+120000
 ]);
 assert.deepEqual(assertion.args,[
  "challengeA",hash,"tenantA","actorA",
  "quoteA","customerA",ch.args[2],at,at+120000
 ]);
 assert.equal(JSON.stringify(h.calls.batches).includes("AQEBA"),false);
 assert.deepEqual(h.calls.dbState,["challenge","binding","audit"]);
});
test("encrypted nonce uses identical authenticated metadata as protected read adapter",async()=>{
 const h=fixture();await h.store.beginBoundChallenge(args);
 const [ch,b]=h.calls.batches[0];
 const aad=new TextEncoder().encode(JSON.stringify([
  hash,"tenantA","actorA","quoteA","challengeA","customerA",
  ch.args[2],at,at+120000
 ]));
 const decrypted=await subtle.decrypt({
  name:"AES-GCM",iv:Uint8Array.from(b.args[0]),additionalData:aad,
  tagLength:128
 },key,Uint8Array.from(b.args[1]));
 const nonce=new TextDecoder().decode(decrypted);
 assert.match(nonce,/^[A-Za-z0-9_-]{43}$/);
 const expected=Array.from(new Uint8Array(await subtle.digest("SHA-256",
  new TextEncoder().encode(nonce))),b=>b.toString(16).padStart(2,"0")).join("");
 assert.equal(expected,ch.args[2]);
});
test("wrong actor, tenant, revoked grant, missing quote and expired session never reach batch",async()=>{
 for(const [opt,arg] of [
  [{allow:false},args],[{sessionValid:false},args],
  [{quoted:false},args],[{sessionExpires:at},args],
  [{},{...args,principal:{tenantId:"other",userId:"actorA"}}],
  [{},{...args,principal:{tenantId:"tenantA",userId:"actorB"}}],
  [{},{...args,sessionKeyHash:"nothex"}],
  [{},{...args,quotationId:"other/quote"}]
 ]){
  const h=fixture(opt);
  await assert.rejects(h.store.beginBoundChallenge(arg),
   /private_atomic_quote_begin_unverified/);
  assert.equal(h.calls.batches.length,0);
 }
});
test("a rejected transactional assertion must not be interpreted as a completed begin",async()=>{
 for(const batchFault of ["no-quote-row","no-binding-row","audit-abort"]){
  const h=fixture({batchFault});
  await assert.rejects(h.store.beginBoundChallenge(args),
   /private_atomic_quote_begin_unverified/);
  assert.equal(h.calls.dbState.length,0);
  assert.equal(h.calls.batches.length,1);
 }
 await assert.rejects(fixture({brokenDb:true}).store.beginBoundChallenge(args),
  /private_atomic_quote_begin_unverified/);
});
