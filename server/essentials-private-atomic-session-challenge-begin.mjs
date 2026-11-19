/**
 * UNMOUNTED SOURCE ONLY: single atomic D1 batch for private quotation challenge
 * creation AND encrypted actor-session binding. No routes, migrations executed,
 * real IdP credentials, Cloudflare deployment or production customer access.
 *
 * This replaces the unsafe two-call begin() then bindSessionChallenge() path.
 * The third SQL statement ALWAYS writes an audit assertion row and its BEFORE
 * INSERT trigger RAISE(ABORT)s if either earlier INSERT wrote zero rows.
 */
import {ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL} from
 "./essentials-private-one-time-consent-store.mjs";
import {ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL} from
 "./essentials-private-session-quotation-challenge-binding.mjs";

const reject=()=>{throw Error("private_atomic_quote_begin_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const te=new TextEncoder();
const MAX_CHALLENGE_MS=300000;
const NOW_SQL="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
export const ESSENTIALS_PRIVATE_ATOMIC_BEGIN_READ_QUOTE_SQL=[
 "SELECT tenant_id,quotation_id,customer_id,quotation_reference,",
 "acceptance_version,total_minor,quotation_sha256",
 "FROM essentials_private_frozen_quotes",
 "WHERE tenant_id=? AND quotation_id=? AND state='accepted'",
 "AND NOT EXISTS(SELECT 1 FROM essentials_private_verified_consents",
 " WHERE tenant_id=? AND quotation_id=?)",
 "LIMIT 1"
].join(" ");
export const ESSENTIALS_PRIVATE_ASSERT_ATOMIC_BEGIN_SQL=[
 "INSERT INTO essentials_private_atomic_session_begins",
 "(challenge_id,session_key_sha256,tenant_id,actor_user_id,",
 "quotation_id,customer_id,nonce_sha256,issued_at_ms,expires_at_ms)",
 "VALUES(?,?,?,?,?,?,?,?,?)"
].join(" ");

function b64(bytes){
 let s="";for(const b of bytes)s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function strongBytes(randomBytes,count){
 let value;try{value=randomBytes(count)}catch{reject()}
 if(!(value instanceof Uint8Array)||value.length!==count||
    value.every(n=>n===0))reject();
 return new Uint8Array(value);
}
function checkTime(now){
 let at;try{at=now()}catch{reject()}
 if(!Number.isSafeInteger(at)||at<=0)reject();
 return at;
}
async function hash(subtle,nonce){
 let bytes;try{bytes=new Uint8Array(await subtle.digest("SHA-256",te.encode(nonce)))}
 catch{reject()}
 if(bytes.length!==32)reject();
 return Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");
}
function metadata(c){
 return te.encode(JSON.stringify([
  c.sessionKeyHash,c.tenantId,c.actorUserId,c.quotationId,
  c.challengeId,c.customerId,c.nonceSha256,c.issuedAtMs,c.expiresAtMs
 ]));
}
export function createEssentialsPrivateAtomicSessionChallengeBegin({
 enabled=false,environment,db,nonceEncryptionKey,loadActiveSession,
 authorizeHostSession,randomBytes,randomUUID,
 cryptoSubtle=globalThis.crypto?.subtle,now=()=>Date.now()
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_atomic_quote_begin_disabled");
 if(typeof db?.prepare!=="function"||typeof db?.batch!=="function"||
    nonceEncryptionKey?.type!=="secret"||
    nonceEncryptionKey?.extractable!==false||
    nonceEncryptionKey?.algorithm?.name!=="AES-GCM"||
    nonceEncryptionKey?.algorithm?.length!==256||
    !nonceEncryptionKey.usages?.includes("encrypt")||
    !nonceEncryptionKey.usages?.includes("decrypt")||
    typeof cryptoSubtle?.encrypt!=="function"||
    typeof cryptoSubtle?.digest!=="function"||
    typeof randomBytes!=="function"||typeof randomUUID!=="function"||
    typeof loadActiveSession!=="function"||
    typeof authorizeHostSession!=="function"||typeof now!=="function")
  throw Error("private_atomic_quote_begin_unconfigured");

 return Object.freeze({
  // Caller is a trusted private host with an independently established actor
  // principal and opaque server-side session digest, NOT browser claims.
  async beginBoundChallenge({principal,sessionKeyHash,quotationId}={}){
   if(!HASH(sessionKeyHash)||!ID(principal?.tenantId)||
      !ID(principal?.userId)||!ID(quotationId))reject();
   const at=checkTime(now);
   let session,allowed=false;
   try{
    [session,allowed]=await Promise.all([
     loadActiveSession({sessionKeyHash}),
     authorizeHostSession({
      principal,sessionKeyHash,quotationId,action:"begin-bound-challenge"
     })
    ]);
   }catch{reject()}
   if(allowed!==true||session?.state!=="active"||
      session.tenantId!==principal.tenantId||
      session.actorUserId!==principal.userId||
      !Number.isSafeInteger(session.expiresAtMs)||
      session.expiresAtMs<=at)reject();
   // Read-only preflight supplies the customer identity for AES-GCM AAD.
   // ALL quote/session/current-state checks run AGAIN inside the D1 batch.
   let quote;
   try{
    quote=await db.prepare(ESSENTIALS_PRIVATE_ATOMIC_BEGIN_READ_QUOTE_SQL)
      .bind(principal.tenantId,quotationId,
       principal.tenantId,quotationId).first();
   }catch{reject()}
   if(!quote||quote.tenant_id!==principal.tenantId||
      quote.quotation_id!==quotationId||!ID(quote.customer_id)||
      !ID(quote.quotation_reference)||
      !HASH(quote.quotation_sha256)||
      !Number.isSafeInteger(quote.acceptance_version)||
      quote.acceptance_version<1||
      !Number.isSafeInteger(quote.total_minor)||quote.total_minor<0)
    reject();
   let challengeId;
   try{challengeId=randomUUID()}catch{reject()}
   if(!ID(challengeId))reject();
   const nonce=b64(strongBytes(randomBytes,32));
   const nonceSha256=await hash(cryptoSubtle,nonce);
   const parentExpiry=at+MAX_CHALLENGE_MS;
   const bindingExpiry=Math.min(parentExpiry,session.expiresAtMs);
   if(!Number.isSafeInteger(parentExpiry)||bindingExpiry<=at)reject();
   const info={
    challengeId,sessionKeyHash,
    tenantId:principal.tenantId,actorUserId:principal.userId,
    quotationId,customerId:quote.customer_id,
    nonceSha256,issuedAtMs:at,expiresAtMs:bindingExpiry
   };
   const iv=strongBytes(randomBytes,12);
   let ciphertext;
   try{
    ciphertext=new Uint8Array(await cryptoSubtle.encrypt({
     name:"AES-GCM",iv,additionalData:metadata(info),tagLength:128
    },nonceEncryptionKey,te.encode(nonce)));
   }catch{reject()}
   if(ciphertext.length<17||ciphertext.length>256)reject();
   // Official D1 batch() is a SQL transaction. The final unconditional
   // INSERT triggers ABORT if any guarded INSERT silently affected zero rows;
   // D1 rolls back all three statements, including the pending challenge.
   let results;
   try{
    results=await db.batch([
     db.prepare(ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL).bind(
      challengeId,principal.userId,nonceSha256,at,parentExpiry,
      principal.tenantId,quotationId
     ),
     db.prepare(ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL).bind(
      Array.from(iv),Array.from(ciphertext),challengeId,sessionKeyHash,
      quotationId,nonceSha256,at,bindingExpiry
     ),
     db.prepare(ESSENTIALS_PRIVATE_ASSERT_ATOMIC_BEGIN_SQL).bind(
      challengeId,sessionKeyHash,principal.tenantId,principal.userId,
      quotationId,quote.customer_id,nonceSha256,at,bindingExpiry
     )
    ]);
   }catch{reject()}
   if(!Array.isArray(results)||results.length!==3||
      results.some(r=>r?.success!==true||
       !Number.isInteger(r.meta?.changes)||r.meta.changes<1))
    // If a supposedly successful batch omitted valid metadata, treat it as
    // an UNVERIFIED outcome; never retry blindly or claim rollback here.
    reject();
   return Object.freeze({
    challengeId,tenantId:principal.tenantId,
    quotationId,customerId:quote.customer_id,
    expiresAtMs:bindingExpiry
   });
  }
 });
}
