import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
 createEssentialsPrivateConsentActorSessionStore,
 ESSENTIALS_PRIVATE_CREATE_SESSION_SQL,
 ESSENTIALS_PRIVATE_READ_SESSION_SQL,
 ESSENTIALS_PRIVATE_REVOKE_SESSION_SQL
} from "../server/essentials-private-consent-actor-session-store.mjs";

const subtle=webcrypto.subtle, te=new TextEncoder();
const at=Date.parse("2026-11-19T19:00:00Z");
const grant={grantId:"grantA",tenantId:"tenantA",actorUserId:"actorA",
 expiresAtMs:at+7*60_000};
const hex=async v=>Array.from(new Uint8Array(await subtle.digest(
 "SHA-256",te.encode(v))),b=>b.toString(16).padStart(2,"0")).join("");
function fixture({allowGrant=true,allowRevoke=true,zeroWrite=false,
 failDb=false,clock=()=>at}={}){
 const rows=new Map(), calls=[];let counter=0;
 let currentGrantAllowed=allowGrant;
 const db={prepare(sql){return {bind(...args){
  calls.push({sql,args});
  return {
   async run(){
    if(failDb)throw Error("synthetic D1 unavailable");
    if(sql!==ESSENTIALS_PRIVATE_CREATE_SESSION_SQL)throw Error("unknown SQL");
    if(zeroWrite||rows.has(args[0])||
       [...rows.values()].some(x=>x.grant_id===args[4]))
     return {success:true,meta:{changes:0}};
    rows.set(args[0],{
     session_key_sha256:args[0],csrf_sha256:args[1],
     tenant_id:args[2],actor_user_id:args[3],grant_id:args[4],
     issued_at_ms:args[5],grant_expires_at_ms:args[6],
     expires_at_ms:args[7],state:"active"
    });
    return {success:true,meta:{changes:1}};
   },
   async first(){
    if(failDb)throw Error("synthetic D1 unavailable");
    if(sql===ESSENTIALS_PRIVATE_READ_SESSION_SQL){
     const r=rows.get(args[0]);
     if(!r||r.state!=="active"||r.issued_at_ms>args[1]||
        r.grant_expires_at_ms<=args[2]||r.expires_at_ms<=args[3])
      return null;
     return {...r};
    }
    if(sql===ESSENTIALS_PRIVATE_REVOKE_SESSION_SQL){
     const [stamp,sessionHash,tenant,actor]=args;
     const r=rows.get(sessionHash);
     if(!r||r.state!=="active"||r.tenant_id!==tenant||
        r.actor_user_id!==actor)return null;
     r.state="revoked";r.revoked_at_ms=stamp;
     return {session_key_sha256:sessionHash};
    }
    throw Error("unknown SQL");
   }
  };
 }};}};
 const approvals=[];
 const store=createEssentialsPrivateConsentActorSessionStore({
  enabled:true,environment:"essentials-private-staging",
  db,cryptoSubtle:subtle,
  randomBytes:n=>new Uint8Array(n).fill(++counter),
  now:clock,
  verifyCurrentActorGrant:async arg=>{
   approvals.push({type:"grant",...arg});return currentGrantAllowed;
  },
  authorizeSessionRevocation:async arg=>{
   approvals.push({type:"revoke",...arg});return allowRevoke;
  }
 });
 return {store,calls,rows,approvals,revokeGrant:()=>{currentGrantAllowed=false}};
}
const issuedToken=output=>output.setCookie.split(";")[0].split("=")[1];
test("unmounted actor session refuses missing staging and trusted grant callbacks",()=>{
 assert.throws(()=>createEssentialsPrivateConsentActorSessionStore(),
  /private_consent_session_store_disabled/);
 assert.throws(()=>createEssentialsPrivateConsentActorSessionStore({
  enabled:true,environment:"production"
 }),/private_consent_session_store_disabled/);
 assert.throws(()=>createEssentialsPrivateConsentActorSessionStore({
  enabled:true,environment:"essentials-private-staging"
 }),/private_consent_session_store_unconfigured/);
});
test("issue mints independent 256-bit cookie and CSRF tokens, stores hashes only",async()=>{
 const h=fixture();
 const output=await h.store.issueSession({grant});
 assert.match(output.setCookie,
  /^__Host-thebe-consent=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=420$/);
 assert.match(output.csrfToken,/^[A-Za-z0-9_-]{43}$/);
 const cookie=issuedToken(output);
 assert.notEqual(cookie,output.csrfToken);
 assert.equal(output.expiresAtMs,grant.expiresAtMs);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].sql,ESSENTIALS_PRIVATE_CREATE_SESSION_SQL);
 assert.deepEqual(h.calls[0].args,[
  await hex(cookie),await hex(output.csrfToken),"tenantA","actorA",
  "grantA",at,grant.expiresAtMs,grant.expiresAtMs
 ]);
 assert.equal(JSON.stringify(h.calls).includes(cookie),false);
 assert.equal(JSON.stringify(h.calls).includes(output.csrfToken),false);
 assert.deepEqual(h.approvals,[{
  type:"grant",grantId:"grantA",tenantId:"tenantA",
  actorUserId:"actorA",operation:"session-issue"
 }]);
});
test("read session and OIDC session verification require current independent actor grant",async()=>{
 const h=fixture(), minted=await h.store.issueSession({grant});
 const sessionKeyHash=await hex(issuedToken(minted));
 const actual=await h.store.loadActiveSession({sessionKeyHash});
 assert.deepEqual(actual,{state:"active",tenantId:"tenantA",
  actorUserId:"actorA",grantId:"grantA",csrfSha256:await hex(minted.csrfToken),
  expiresAtMs:grant.expiresAtMs});
 assert.equal(await h.store.verifyActiveSession({
  sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA",
  operation:"oidc-begin"
 }),true);
 for(const patch of [
  {tenantId:"tenantB"},{actorUserId:"actorB"},
  {operation:"not-an-authorized-operation"}
 ]){
  assert.equal(await h.store.verifyActiveSession({
   sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA",
   operation:"oidc-complete",...patch
  }),false);
 }
 assert.equal(await h.store.loadActiveSession({
  sessionKeyHash:"f".repeat(64)
 }),null);
 assert.ok(h.approvals.some(a=>a.operation==="session-read"));
 assert.ok(h.approvals.some(a=>a.operation==="oidc-begin"));
 assert.equal(h.calls.filter(a=>a.sql===ESSENTIALS_PRIVATE_READ_SESSION_SQL).length>=2,true);
});
test("revocation immediately denies read and replay and is irreversible",async()=>{
 const h=fixture(), minted=await h.store.issueSession({grant});
 const sessionKeyHash=await hex(issuedToken(minted));
 assert.equal(await h.store.revokeSession({
  sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA"
 }),true);
 assert.equal(await h.store.loadActiveSession({sessionKeyHash}),null);
 assert.equal(await h.store.verifyActiveSession({
  sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA",operation:"oidc-begin"
 }),false);
 assert.equal(await h.store.revokeSession({
  sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA"
 }),false);
 assert.equal(h.rows.get(sessionKeyHash).state,"revoked");
});
test("deny forged grants, weak format, missing authorization and duplicate issuance",async()=>{
 for(const g of [
  {...grant,tenantId:"attacker/id"},{...grant,actorUserId:""},
  {...grant,grantId:"bad/id"},{...grant,expiresAtMs:at},
  {...grant,expiresAtMs:at+500}
 ]){
  const h=fixture();
  await assert.rejects(h.store.issueSession({grant:g}),
   /private_consent_session_store_unverified/);
  assert.equal(h.calls.length,0);
 }
 for(const opts of [{allowGrant:false},{zeroWrite:true},{failDb:true}]){
  const h=fixture(opts);
  await assert.rejects(h.store.issueSession({grant}),
   /private_consent_session_store_unverified/);
 }
 const h=fixture(); await h.store.issueSession({grant});
 await assert.rejects(h.store.issueSession({grant}),
  /private_consent_session_store_unverified/);
});
test("deny revoked actor privileges, expired session and unauthorized revoke",async()=>{
 const h=fixture({allowGrant:false});
 assert.equal(await h.store.loadActiveSession({sessionKeyHash:"a".repeat(64)}),null);
 const noRevoke=fixture({allowRevoke:false});
 const minted=await noRevoke.store.issueSession({grant});
 const sh=await hex(issuedToken(minted));
 await assert.rejects(noRevoke.store.revokeSession({
  sessionKeyHash:sh,tenantId:"tenantA",actorUserId:"actorA"
 }),/private_consent_session_store_unverified/);
 assert.equal((await noRevoke.store.loadActiveSession({sessionKeyHash:sh})).state,"active");
 let future=at;
 const expired=fixture({clock:()=>future});
 const mintedExp=await expired.store.issueSession({grant});
 const expHash=await hex(issuedToken(mintedExp));
 future=grant.expiresAtMs+1;
 assert.equal(await expired.store.loadActiveSession({sessionKeyHash:expHash}),null);
 const other=fixture();
 await assert.rejects(other.store.revokeSession({
  sessionKeyHash:"bad-hash",tenantId:"tenantA",actorUserId:"actorA"
 }),/private_consent_session_store_unverified/);
});

test("revoking independent actor grant makes existing session unusable immediately",async()=>{
 const h=fixture();
 const minted=await h.store.issueSession({grant});
 const sessionKeyHash=await hex(issuedToken(minted));
 assert.ok(await h.store.loadActiveSession({sessionKeyHash}));
 h.revokeGrant();
 assert.equal(await h.store.loadActiveSession({sessionKeyHash}),null);
 assert.equal(await h.store.verifyActiveSession({
  sessionKeyHash,tenantId:"tenantA",actorUserId:"actorA",operation:"oidc-complete"
 }),false);
});
