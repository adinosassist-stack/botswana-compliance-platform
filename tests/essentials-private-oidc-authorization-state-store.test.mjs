import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateOidcAuthorizationStateStore,
 ESSENTIALS_PRIVATE_SAVE_OIDC_STATE_SQL,
 ESSENTIALS_PRIVATE_CONSUME_OIDC_STATE_SQL
} from "../server/essentials-private-oidc-authorization-state-store.mjs";
const subtle=webcrypto.subtle;
const key=await subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const at=Date.parse("2026-11-19T19:00:00Z");
const base={
 stateSha256:"a".repeat(64),sessionKeyHash:"b".repeat(64),
 tenantId:"tenantA",actorUserId:"actorA",quotationId:"quoteA",
 challengeId:"challengeA",customerId:"customerA",nonceSha256:"c".repeat(64),
 issuer:"https://identity.example.test",clientId:"private.client:1",
 redirectUri:"https://private.example.test/callback",
 tokenEndpoint:"https://identity.example.test/token",
 issuedAtMs:at-1000,expiresAtMs:at+30000,
 codeVerifier:"K".repeat(43)
};
function setup(opts={}){
 const calls=[],state=new Map();
 const db={prepare(sql){return {bind(...args){
  calls.push({sql,args});
  return {
   async run(){
    if(opts.fail)throw Error("db failure");
    if(sql!==ESSENTIALS_PRIVATE_SAVE_OIDC_STATE_SQL)throw Error("unexpected query");
    if(opts.zero||state.has(args[0]))return {success:true,meta:{changes:0}};
    state.set(args[0],args);
    return {success:true,meta:{changes:1}};
   },
   async first(){
    if(opts.fail)throw Error("db failure");
    if(sql!==ESSENTIALS_PRIVATE_CONSUME_OIDC_STATE_SQL)throw Error("unexpected query");
    const [stamp,hash,sessionHash,issued,expiry]=args;
    const b=state.get(hash);
    if(!b||b[1]!==sessionHash||b[16]==="consumed"||
       b[14]>issued||b[15]<=expiry) return null;
    b[16]="consumed";
    return {
      state_sha256:b[0],session_key_sha256:b[1],
      tenant_id:b[2],actor_user_id:b[3],quotation_id:b[4],
      challenge_id:b[5],customer_id:b[6],nonce_sha256:b[7],
      verifier_iv:opts.tamperIv?Array(12).fill(0):b[8],
      verifier_ciphertext:opts.tamperCipher?Array(64).fill(1):b[9],
      issuer:b[10],client_id:b[11],redirect_uri:b[12],
      token_endpoint:b[13],issued_at_ms:b[14],
      expires_at_ms:b[15],state:"consumed"
    };
   }
  };
 }};}};
 let count=0;
 const store=createEssentialsPrivateOidcAuthorizationStateStore({
  enabled:true,environment:"essentials-private-staging",
  db,cryptoSubtle:subtle,verifierEncryptionKey:key,
  randomBytes:n=>new Uint8Array(n).fill(++count)
 });
 return {store,calls,state};
}
test("off by default and no weak/extractable AES key",async()=>{
 assert.throws(()=>createEssentialsPrivateOidcAuthorizationStateStore(),
  /private_oidc_state_disabled/);
 assert.throws(()=>createEssentialsPrivateOidcAuthorizationStateStore({
  enabled:true,environment:"essentials-private-staging"
 }),/private_oidc_state_unconfigured/);
 const weak=await subtle.generateKey({name:"AES-GCM",length:128},true,["encrypt","decrypt"]);
 assert.throws(()=>createEssentialsPrivateOidcAuthorizationStateStore({
  enabled:true,environment:"essentials-private-staging",
  db:{prepare(){}},verifierEncryptionKey:weak,randomBytes:()=>new Uint8Array(12)
 }),/private_oidc_state_unconfigured/);
});
test("PKCE verifier is sealed, never stored plaintext, and recovered once with exact bound metadata",async()=>{
 const h=setup();
 assert.equal(await h.store.persistAuthorizationAttempt(base),true);
 const call=h.calls[0];
 assert.equal(call.sql,ESSENTIALS_PRIVATE_SAVE_OIDC_STATE_SQL);
 assert.equal(call.args.length,16);
 assert.notEqual(JSON.stringify(call.args).includes(base.codeVerifier),true);
 assert.equal(call.args[8].length,12);
 assert.ok(call.args[9].length>43);
 const used=await h.store.consumeAuthorizationAttempt({
  stateSha256:base.stateSha256,sessionKeyHash:base.sessionKeyHash,nowMs:at
 });
 assert.deepEqual({...base,state:"consumed"},used);
 assert.equal(h.calls[1].sql,ESSENTIALS_PRIVATE_CONSUME_OIDC_STATE_SQL);
 assert.deepEqual(h.calls[1].args,[at,base.stateSha256,base.sessionKeyHash,at,at]);
 assert.equal(await h.store.consumeAuthorizationAttempt({
  stateSha256:base.stateSha256,sessionKeyHash:base.sessionKeyHash,nowMs:at
 }),null);
});
test("wrong session fails atomically and does not consume legitimate state",async()=>{
 const h=setup();
 await h.store.persistAuthorizationAttempt(base);
 assert.equal(await h.store.consumeAuthorizationAttempt({
  stateSha256:base.stateSha256,sessionKeyHash:"d".repeat(64),nowMs:at
 }),null);
 assert.equal((await h.store.consumeAuthorizationAttempt({
  stateSha256:base.stateSha256,sessionKeyHash:base.sessionKeyHash,nowMs:at
 })).codeVerifier,base.codeVerifier);
});
test("tampered ciphertext or IV is not converted to a valid PKCE verifier",async()=>{
 for(const option of [{tamperCipher:true},{tamperIv:true}]){
  const h=setup(option);
  await h.store.persistAuthorizationAttempt(base);
  await assert.rejects(h.store.consumeAuthorizationAttempt({
   stateSha256:base.stateSha256,sessionKeyHash:base.sessionKeyHash,nowMs:at
  }),/private_oidc_state_unverified/);
 }
});
test("malformed, overlong, expired state and unsupported details never write",async()=>{
 const invalid=[
  {stateSha256:"nothex"},{sessionKeyHash:"x"},
  {tenantId:"other/tenant"},{nonceSha256:"x".repeat(64)},
  {codeVerifier:"too-short"},{expiresAtMs:base.issuedAtMs+300001},
  {expiresAtMs:base.issuedAtMs}, {clientId:"illegal space"},
  {issuer:"http://identity.example.test"}
 ];
 for(const change of invalid){
  const h=setup();
  await assert.rejects(h.store.persistAuthorizationAttempt({...base,...change}),
    /private_oidc_state_unverified/);
  assert.equal(h.calls.length,0);
 }
 for(const opt of [{zero:true},{fail:true}]){
  const h=setup(opt);
  if(opt.zero)assert.equal(await h.store.persistAuthorizationAttempt(base),false);
  else await assert.rejects(h.store.persistAuthorizationAttempt(base),
   /private_oidc_state_unverified/);
 }
});
test("strict one-time consume protects incorrect expiry and failed D1",async()=>{
 const h=setup();await h.store.persistAuthorizationAttempt(base);
 assert.equal(await h.store.consumeAuthorizationAttempt({
  stateSha256:base.stateSha256,sessionKeyHash:base.sessionKeyHash,
  nowMs:base.expiresAtMs
 }),null);
 assert.equal((await h.store.consumeAuthorizationAttempt({
  stateSha256:base.stateSha256,sessionKeyHash:base.sessionKeyHash,nowMs:at
 })).codeVerifier,base.codeVerifier);
 await assert.rejects(setup({fail:true}).store.consumeAuthorizationAttempt({
  stateSha256:base.stateSha256,sessionKeyHash:base.sessionKeyHash,nowMs:at
 }),/private_oidc_state_unverified/);
});
