import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateSessionQuotationChallengeBinding,
 ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL as BIND,
 ESSENTIALS_PRIVATE_READ_SESSION_CHALLENGE_SQL as READ,
 ESSENTIALS_PRIVATE_REVOKE_SESSION_CHALLENGE_SQL as REVOKE
} from "../server/essentials-private-session-quotation-challenge-binding.mjs";

const at=Date.parse("2026-11-19T20:00:00Z"),subtle=webcrypto.subtle;
const key=await subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const sessionHash="a".repeat(64),nonce="N".repeat(43);
const principal={tenantId:"tenantA",userId:"actorA"};
const quotationId="quoteA",challengeId="challengeA";
const original={challengeId,nonce,expiresAtMs:at+299000};
const expectedNonceHash=Array.from(new Uint8Array(await subtle.digest(
 "SHA-256",new TextEncoder().encode(nonce))),b=>b.toString(16).padStart(2,"0")).join("");
const activeSession={state:"active",tenantId:"tenantA",
 actorUserId:"actorA",expiresAtMs:at+120000};
const parent={
 state:"pending",challengeId,tenantId:"tenantA",actorUserId:"actorA",
 quotationId,customerId:"customerA",nonce,
 issuedAtMs:at-500,expiresAtMs:at+299000
};
const startArgs={sessionKeyHash:sessionHash,principal,quotationId,challenge:original};
const lookupArgs={sessionKeyHash:sessionHash,tenantId:"tenantA",actorUserId:"actorA",
 quotationId,challengeId};
async function mustDenyRead(operation){
 const result=await operation().then(value=>({value}),error=>({error}));
 if(result.error)assert.match(result.error.message,/private_session_quote_challenge_unverified/);
 else assert.equal(result.value,null);
}
function fixture({allowRevoke=true,noInsert=false,dbError=false}={}){
 const state={session:{...activeSession},parent:{...parent},row:null,
  calls:[],authorities:[],revokes:[]};
 let counter=0;
 const db={prepare(sql){return {bind(...args){
  state.calls.push({sql,args});
  return {
   async run(){
    if(dbError)throw Error("db unavailable");
    if(sql!==BIND)throw Error("wrong query");
    if(noInsert||state.row)return {success:true,meta:{changes:0}};
    state.row={
     challenge_id:args[2],session_key_sha256:args[3],
     tenant_id:"tenantA",actor_user_id:"actorA",
     quotation_id:args[4],customer_id:"customerA",
     nonce_sha256:args[5],nonce_iv:args[0],
     nonce_ciphertext:args[1],issued_at_ms:args[6],
     expires_at_ms:args[7],state:"pending"
    };
    return {success:true,meta:{changes:1}};
   },
   async first(){
    if(dbError)throw Error("db unavailable");
    if(sql===READ){
     const r=state.row;
     if(!r||r.state!=="pending"||
       r.session_key_sha256!==args[0]||r.challenge_id!==args[1]||
       r.tenant_id!==args[2]||r.actor_user_id!==args[3]||
       r.quotation_id!==args[4]||r.expires_at_ms<=args[6])return null;
     return {...r};
    }
    if(sql===REVOKE){
     state.revokes.push(args);
     const r=state.row;
     if(!r||r.state!=="pending"||r.session_key_sha256!==args[1]||
      r.tenant_id!==args[2]||r.actor_user_id!==args[3]||
      r.quotation_id!==args[4]||r.challenge_id!==args[5])return null;
     r.state="revoked";return {challenge_id:r.challenge_id};
    }
    throw Error("wrong read query");
   }
  };
 }};}};
 const service=createEssentialsPrivateSessionQuotationChallengeBinding({
  enabled:true,environment:"essentials-private-staging",
  db,nonceEncryptionKey:key,cryptoSubtle:subtle,now:()=>at,
  randomBytes:n=>new Uint8Array(n).fill(++counter),
  loadActiveSession:async({sessionKeyHash:given})=>
    given===sessionHash?state.session:null,
  oneTimeConsentStore:{async loadOneTimeChallenge(input){
   state.authorities.push(input);
   if(input.challengeId!==challengeId||input.quotationId!==quotationId||
      input.nonce!==nonce||input.principal.tenantId!=="tenantA"||
      input.principal.userId!=="actorA")throw Error("parent mismatch");
   return state.parent;
  }},
  authorizeChallengeRevocation:async()=>allowRevoke
 });
 return {service,state};
}
test("session binding is disabled unless private AES-GCM 256-key and callbacks are qualified",async()=>{
 assert.throws(()=>createEssentialsPrivateSessionQuotationChallengeBinding(),
  /private_session_quote_challenge_disabled/);
 assert.throws(()=>createEssentialsPrivateSessionQuotationChallengeBinding({
  enabled:true,environment:"production"
 }),/private_session_quote_challenge_disabled/);
 assert.throws(()=>createEssentialsPrivateSessionQuotationChallengeBinding({
  enabled:true,environment:"essentials-private-staging"
 }),/private_session_quote_challenge_unconfigured/);
 const extractable=await subtle.generateKey({name:"AES-GCM",length:256},true,
  ["encrypt","decrypt"]);
 assert.throws(()=>createEssentialsPrivateSessionQuotationChallengeBinding({
  enabled:true,environment:"essentials-private-staging",
  db:{prepare(){}},nonceEncryptionKey:extractable,
  oneTimeConsentStore:{loadOneTimeChallenge:async()=>{}},
  loadActiveSession:async()=>{},authorizeChallengeRevocation:async()=>{},
  randomBytes:()=>new Uint8Array(12)
 }),/private_session_quote_challenge_unconfigured/);
});
test("bind persists only encrypted nonce and verified session+quote metadata",async()=>{
 const h=fixture();
 const result=await h.service.bindSessionChallenge(startArgs);
 assert.deepEqual(result,{challengeId,tenantId:"tenantA",actorUserId:"actorA",
  quotationId,customerId:"customerA",expiresAtMs:at+120000});
 const first=h.state.calls[0];
 assert.equal(first.sql,BIND);
 assert.equal(first.args.length,8);
 assert.deepEqual(first.args.slice(2),[
  challengeId,sessionHash,quotationId,expectedNonceHash,
  at-500,at+120000
 ]);
 assert.equal(first.args[0].length,12);
 assert.ok(first.args[1].length>nonce.length);
 assert.equal(JSON.stringify(first.args).includes(nonce),false);
 assert.equal(h.state.authorities[0].nonce,nonce);
 assert.equal(h.state.authorities[0].principal.userId,"actorA");
});
test("host obtains original nonce only after fresh session, exact read and decryption",async()=>{
 const h=fixture();
 await h.service.bindSessionChallenge(startArgs);
 const r=await h.service.loadSessionChallenge(lookupArgs);
 assert.deepEqual(r,{state:"pending",challengeId,tenantId:"tenantA",
  actorUserId:"actorA",quotationId,customerId:"customerA",
  nonce,expiresAtMs:at+120000});
 assert.equal(h.state.calls[1].sql,READ);
 assert.deepEqual(h.state.calls[1].args,[
  sessionHash,challengeId,"tenantA","actorA",quotationId,at,at
 ]);
 assert.equal(h.state.authorities.length,2);
});
test("mismatched session, actor, quote, challenge, revoked current session reject",async()=>{
 const h=fixture();
 for(const input of [
  {...startArgs,sessionKeyHash:"b".repeat(64)},
  {...startArgs,principal:{tenantId:"other",userId:"actorA"}},
  {...startArgs,principal:{tenantId:"tenantA",userId:"actorB"}},
  {...startArgs,quotationId:"other"},
  {...startArgs,challenge:{...original,nonce:"X".repeat(43)}},
  {...startArgs,challenge:{...original,expiresAtMs:at+1}}
 ]){
  await assert.rejects(h.service.bindSessionChallenge(input),
   /private_session_quote_challenge_unverified/);
 }
 assert.equal(h.state.calls.length,0);
 await h.service.bindSessionChallenge(startArgs);
 for(const patch of [
  {sessionKeyHash:"b".repeat(64)},{tenantId:"other"},
  {actorUserId:"other"},{quotationId:"other"},{challengeId:"other"}
 ]){
  await mustDenyRead(()=>h.service.loadSessionChallenge({...lookupArgs,...patch}));
 }
 h.state.session.state="revoked";
 await mustDenyRead(()=>h.service.loadSessionChallenge(lookupArgs));
});
test("revoked parent, ciphertext modification, shortened expiry and stale source deny",async()=>{
 for(const mutation of ["parent-state","parent-customer","cipher","iv",
   "nonce-hash","expired-parent","expired-binding"]){
  const h=fixture();await h.service.bindSessionChallenge(startArgs);
  if(mutation==="parent-state")h.state.parent.state="consumed";
  if(mutation==="parent-customer")h.state.parent.customerId="other";
  if(mutation==="cipher")h.state.row.nonce_ciphertext[0]^=1;
  if(mutation==="iv")h.state.row.nonce_iv[1]^=1;
  if(mutation==="nonce-hash")h.state.row.nonce_sha256="f".repeat(64);
  if(mutation==="expired-parent")h.state.parent.expiresAtMs=at-1;
  if(mutation==="expired-binding")h.state.row.expires_at_ms=at;
  await mustDenyRead(()=>h.service.loadSessionChallenge(lookupArgs));
 }
});
test("explicit authorized revocation rejects replay and unapproved revoke",async()=>{
 const h=fixture();
 await h.service.bindSessionChallenge(startArgs);
 assert.equal(await h.service.revokeSessionChallenge(lookupArgs),true);
 assert.equal(await h.service.loadSessionChallenge(lookupArgs),null);
 assert.equal(await h.service.revokeSessionChallenge(lookupArgs),false);
 const locked=fixture({allowRevoke:false});
 await locked.service.bindSessionChallenge(startArgs);
 await assert.rejects(locked.service.revokeSessionChallenge(lookupArgs),
  /private_session_quote_challenge_unverified/);
 assert.equal((await locked.service.loadSessionChallenge(lookupArgs)).state,
  "pending");
});
test("database errors and zero-row guarded binding fail closed",async()=>{
 for(const cfg of [{dbError:true},{noInsert:true}]){
  const h=fixture(cfg);
  await assert.rejects(h.service.bindSessionChallenge(startArgs),
   /private_session_quote_challenge_unverified/);
 }
});
