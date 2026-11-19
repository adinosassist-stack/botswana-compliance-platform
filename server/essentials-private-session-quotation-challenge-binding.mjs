/**
 * UNMOUNTED SOURCE ONLY: encrypted session-to-frozen-quote challenge binding.
 * Isolated Essentials private staging candidate. No routes, real users, D1
 * execution, external identity providers or production Finance integration.
 *
 * A TENANT ACTOR session is NOT a customer identity. The customer must still
 * independently complete verified OIDC reauthentication and account linking.
 */
const fail=()=>{throw Error("private_session_quote_challenge_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const NONCE=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const te=new TextEncoder(),td=new TextDecoder("utf-8",{fatal:true});
const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
export const ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL=[
 "INSERT INTO essentials_private_session_quotation_challenges",
 "(challenge_id,session_key_sha256,tenant_id,actor_user_id,quotation_id,",
 "customer_id,nonce_sha256,nonce_iv,nonce_ciphertext,issued_at_ms,expires_at_ms)",
 "SELECT ch.challenge_id,s.session_key_sha256,ch.tenant_id,ch.actor_user_id,",
 "ch.quotation_id,ch.customer_id,ch.nonce_sha256,?,?,ch.issued_at_ms,",
 "MIN(ch.expires_at_ms,s.expires_at_ms)",
 "FROM essentials_private_one_time_challenges AS ch",
 "JOIN essentials_private_consent_actor_sessions AS s",
 " ON s.tenant_id=ch.tenant_id AND s.actor_user_id=ch.actor_user_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=ch.tenant_id AND q.quotation_id=ch.quotation_id",
 "WHERE ch.challenge_id=? AND s.session_key_sha256=? AND ch.quotation_id=?",
 "AND ch.nonce_sha256=? AND ch.issued_at_ms=?",
 "AND MIN(ch.expires_at_ms,s.expires_at_ms)=?",
 "AND s.state='active' AND ch.state='pending' AND q.state='accepted'",
 "AND q.customer_id=ch.customer_id AND q.quotation_sha256=ch.quotation_sha256",
 "AND q.quotation_reference=ch.quotation_reference",
 "AND q.acceptance_version=ch.acceptance_version AND q.total_minor=ch.total_minor",
 "AND s.issued_at_ms<="+DB_NOW+" AND ch.issued_at_ms<="+DB_NOW,
 "AND s.expires_at_ms>"+DB_NOW+" AND s.grant_expires_at_ms>"+DB_NOW,
 "AND ch.expires_at_ms>"+DB_NOW
].join(" ");
export const ESSENTIALS_PRIVATE_READ_SESSION_CHALLENGE_SQL=[
 "SELECT b.challenge_id,b.session_key_sha256,b.tenant_id,b.actor_user_id,",
 "b.quotation_id,b.customer_id,b.nonce_sha256,b.nonce_iv,b.nonce_ciphertext,",
 "b.issued_at_ms,b.expires_at_ms,b.state",
 "FROM essentials_private_session_quotation_challenges AS b",
 "JOIN essentials_private_consent_actor_sessions AS s",
 " ON s.session_key_sha256=b.session_key_sha256",
 "JOIN essentials_private_one_time_challenges AS ch",
 " ON ch.challenge_id=b.challenge_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=b.tenant_id AND q.quotation_id=b.quotation_id",
 "WHERE b.session_key_sha256=? AND b.challenge_id=?",
 "AND b.tenant_id=? AND b.actor_user_id=? AND b.quotation_id=?",
 "AND b.state='pending' AND s.state='active' AND ch.state='pending'",
 "AND q.state='accepted' AND s.tenant_id=b.tenant_id",
 "AND s.actor_user_id=b.actor_user_id",
 "AND ch.tenant_id=b.tenant_id AND ch.actor_user_id=b.actor_user_id",
 "AND ch.quotation_id=b.quotation_id AND ch.customer_id=b.customer_id",
 "AND ch.nonce_sha256=b.nonce_sha256",
 "AND ch.issued_at_ms=b.issued_at_ms",
 "AND b.expires_at_ms=MIN(s.expires_at_ms,ch.expires_at_ms)",
 "AND q.customer_id=b.customer_id",
 "AND q.quotation_sha256=ch.quotation_sha256",
 "AND q.quotation_reference=ch.quotation_reference",
 "AND q.acceptance_version=ch.acceptance_version AND q.total_minor=ch.total_minor",
 "AND s.issued_at_ms<="+DB_NOW+" AND ch.issued_at_ms<="+DB_NOW,
 "AND s.expires_at_ms>"+DB_NOW+" AND s.grant_expires_at_ms>"+DB_NOW,
 "AND ch.expires_at_ms>"+DB_NOW+" AND b.expires_at_ms>"+DB_NOW,
 "AND b.issued_at_ms<=? AND b.expires_at_ms>?",
 "LIMIT 1"
].join(" ");
export const ESSENTIALS_PRIVATE_REVOKE_SESSION_CHALLENGE_SQL=[
 "UPDATE essentials_private_session_quotation_challenges",
 "SET state='revoked',revoked_at_ms=?",
 "WHERE session_key_sha256=? AND tenant_id=? AND actor_user_id=?",
 "AND quotation_id=? AND challenge_id=? AND state='pending'",
 "RETURNING challenge_id"
].join(" ");
function recordData({sessionKeyHash,tenantId,actorUserId,quotationId,
 challengeId,customerId,nonceSha256,issuedAtMs,expiresAtMs}){
 return {sessionKeyHash,tenantId,actorUserId,quotationId,challengeId,
  customerId,nonceSha256,issuedAtMs,expiresAtMs};
}
function aad(info){
 return te.encode(JSON.stringify([
  info.sessionKeyHash,info.tenantId,info.actorUserId,info.quotationId,
  info.challengeId,info.customerId,info.nonceSha256,
  info.issuedAtMs,info.expiresAtMs
 ]));
}
function bytes(x){
 if(x instanceof Uint8Array)return new Uint8Array(x);
 if(x instanceof ArrayBuffer)return new Uint8Array(x);
 if(Array.isArray(x)&&x.every(v=>Number.isInteger(v)&&v>=0&&v<=255))
  return Uint8Array.from(x);
 fail();
}
async function sha(subtle,nonce){
 let d;try{d=new Uint8Array(await subtle.digest("SHA-256",te.encode(nonce)))}
 catch{fail()}
 if(d.length!==32)fail();
 return Array.from(d,b=>b.toString(16).padStart(2,"0")).join("");
}
function time(now){
 let at;try{at=now()}catch{fail()}
 if(!Number.isSafeInteger(at)||at<=0)fail();
 return at;
}
function sameSession(s,sessionKeyHash,tenantId,actorUserId,at){
 return s&&s.state==="active"&&s.tenantId===tenantId&&
  s.actorUserId===actorUserId&&Number.isSafeInteger(s.expiresAtMs)&&
  s.expiresAtMs>at&&HASH(sessionKeyHash);
}
function sameChallenge(c,info,nonce,at){
 return c&&c.state==="pending"&&
  c.challengeId===info.challengeId&&c.tenantId===info.tenantId&&
  c.actorUserId===info.actorUserId&&c.quotationId===info.quotationId&&
  c.customerId===info.customerId&&c.nonce===nonce&&
  c.issuedAtMs===info.issuedAtMs&&c.expiresAtMs>=info.expiresAtMs&&
  c.expiresAtMs>at;
}
export function createEssentialsPrivateSessionQuotationChallengeBinding({
 enabled=false,environment,db,nonceEncryptionKey,
 oneTimeConsentStore,loadActiveSession,
 authorizeChallengeRevocation,randomBytes,
 cryptoSubtle=globalThis.crypto?.subtle,now=()=>Date.now()
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_session_quote_challenge_disabled");
 if(typeof db?.prepare!=="function"||
    nonceEncryptionKey?.type!=="secret"||
    nonceEncryptionKey?.extractable!==false||
    nonceEncryptionKey.algorithm?.name!=="AES-GCM"||
    nonceEncryptionKey.algorithm?.length!==256||
    !nonceEncryptionKey.usages?.includes("encrypt")||
    !nonceEncryptionKey.usages?.includes("decrypt")||
    typeof cryptoSubtle?.encrypt!=="function"||
    typeof cryptoSubtle?.decrypt!=="function"||
    typeof cryptoSubtle?.digest!=="function"||
    typeof oneTimeConsentStore?.loadOneTimeChallenge!=="function"||
    typeof loadActiveSession!=="function"||
    typeof authorizeChallengeRevocation!=="function"||
    typeof randomBytes!=="function"||typeof now!=="function")
  throw Error("private_session_quote_challenge_unconfigured");
 const active=async({sessionKeyHash,tenantId,actorUserId},at)=>{
  let s;try{s=await loadActiveSession({sessionKeyHash})}catch{fail()}
  if(!sameSession(s,sessionKeyHash,tenantId,actorUserId,at))fail();
  return s;
 };
 const authoritative=async({tenantId,actorUserId,quotationId,challengeId,nonce})=>{
  let c;try{
   c=await oneTimeConsentStore.loadOneTimeChallenge({
    principal:{tenantId,userId:actorUserId},quotationId,challengeId,nonce
   });
  }catch{fail()}
  return c;
 };
 return Object.freeze({
  // Call ONLY from an authenticated host after the one-time challenge BEGIN.
  // NEVER allow caller to supply arbitrary principal or nonce as browser data.
  async bindSessionChallenge({
   sessionKeyHash,principal,quotationId,challenge
  }={}){
   if(!HASH(sessionKeyHash)||!ID(principal?.tenantId)||
      !ID(principal?.userId)||!ID(quotationId)||
      !ID(challenge?.challengeId)||!NONCE(challenge?.nonce))fail();
   const tenantId=principal.tenantId,actorUserId=principal.userId;
   const at=time(now);
   const session=await active({sessionKeyHash,tenantId,actorUserId},at);
   const c=await authoritative({
    tenantId,actorUserId,quotationId,
    challengeId:challenge.challengeId,nonce:challenge.nonce
   });
   const expiresAtMs=Math.min(session.expiresAtMs,c?.expiresAtMs??0);
   const info=recordData({
    sessionKeyHash,tenantId,actorUserId,quotationId,
    challengeId:challenge.challengeId,customerId:c?.customerId,
    nonceSha256:await sha(cryptoSubtle,challenge.nonce),
    issuedAtMs:c?.issuedAtMs,expiresAtMs
   });
   if(!ID(info.customerId)||!Number.isSafeInteger(info.issuedAtMs)||
      !Number.isSafeInteger(info.expiresAtMs)||info.expiresAtMs<=at||
      c?.expiresAtMs!==challenge.expiresAtMs||
      !sameChallenge(c,info,challenge.nonce,at))fail();
   let iv;try{iv=randomBytes(12)}catch{fail()}
   if(!(iv instanceof Uint8Array)||iv.length!==12||
      iv.every(v=>v===0))fail();
   let encrypted;
   try{encrypted=bytes(await cryptoSubtle.encrypt({
    name:"AES-GCM",iv,additionalData:aad(info),tagLength:128
   },nonceEncryptionKey,te.encode(challenge.nonce)))}catch{fail()}
   if(encrypted.length<17||encrypted.length>256)fail();
   let result;
   try{
    result=await db.prepare(ESSENTIALS_PRIVATE_BIND_SESSION_CHALLENGE_SQL)
      .bind(Array.from(iv),Array.from(encrypted),info.challengeId,
       sessionKeyHash,quotationId,info.nonceSha256,info.issuedAtMs,
       info.expiresAtMs).run();
   }catch{fail()}
   if(result?.success!==true||result.meta?.changes!==1)fail();
   return Object.freeze({
     challengeId:info.challengeId,tenantId,actorUserId,quotationId,
     customerId:info.customerId,expiresAtMs
   });
  },
  // Compatible with #2697 and #2701 loadSessionChallenge callback.
  // NEVER return plaintext nonce to the browser or expose this method as a
  // route. The trusted host must bind the supplied keys to its own session.
  async loadSessionChallenge({
   sessionKeyHash,tenantId,actorUserId,quotationId,challengeId
  }={}){
   if(!HASH(sessionKeyHash)||![tenantId,actorUserId,quotationId,challengeId]
     .every(ID))fail();
   const at=time(now);
   await active({sessionKeyHash,tenantId,actorUserId},at);
   let row;
   try{
    row=await db.prepare(ESSENTIALS_PRIVATE_READ_SESSION_CHALLENGE_SQL)
      .bind(sessionKeyHash,challengeId,tenantId,actorUserId,quotationId,
       at,at).first();
   }catch{fail()}
   if(!row)return null;
   const info=recordData({
    sessionKeyHash:row.session_key_sha256,tenantId:row.tenant_id,
    actorUserId:row.actor_user_id,quotationId:row.quotation_id,
    challengeId:row.challenge_id,customerId:row.customer_id,
    nonceSha256:row.nonce_sha256,
    issuedAtMs:row.issued_at_ms,expiresAtMs:row.expires_at_ms
   });
   if(info.sessionKeyHash!==sessionKeyHash||
      info.tenantId!==tenantId||info.actorUserId!==actorUserId||
      info.quotationId!==quotationId||info.challengeId!==challengeId||
      !ID(info.customerId)||!HASH(info.nonceSha256)||
      !Number.isSafeInteger(info.issuedAtMs)||
      !Number.isSafeInteger(info.expiresAtMs)||
      info.issuedAtMs>at||info.expiresAtMs<=at||
      row.state!=="pending")fail();
   const iv=bytes(row.nonce_iv),cipher=bytes(row.nonce_ciphertext);
   if(iv.length!==12||cipher.length<17||cipher.length>256)fail();
   let raw;
   try{raw=bytes(await cryptoSubtle.decrypt({
    name:"AES-GCM",iv,additionalData:aad(info),tagLength:128
   },nonceEncryptionKey,cipher))}catch{fail()}
   let nonce;
   try{nonce=td.decode(raw)}catch{fail()}finally{raw.fill(0)}
   if(!NONCE(nonce)||await sha(cryptoSubtle,nonce)!==info.nonceSha256)
    fail();
   const current=await authoritative({
    tenantId,actorUserId,quotationId,challengeId,nonce
   });
   if(!sameChallenge(current,info,nonce,at))fail();
   return Object.freeze({
    state:"pending",challengeId,tenantId,actorUserId,quotationId,
    customerId:info.customerId,nonce,expiresAtMs:info.expiresAtMs
   });
  },
  // Requires independent privileged host authorization; no browser-issued
  // tenant/customer identifiers authorize revocation.
  async revokeSessionChallenge({
   sessionKeyHash,tenantId,actorUserId,quotationId,challengeId
  }={}){
   if(!HASH(sessionKeyHash)||![tenantId,actorUserId,quotationId,challengeId]
     .every(ID))fail();
   let allowed=false;
   try{allowed=await authorizeChallengeRevocation({
    sessionKeyHash,tenantId,actorUserId,quotationId,challengeId
   })}catch{fail()}
   if(allowed!==true)fail();
   const at=time(now);
   let row;
   try{row=await db.prepare(ESSENTIALS_PRIVATE_REVOKE_SESSION_CHALLENGE_SQL)
    .bind(at,sessionKeyHash,tenantId,actorUserId,quotationId,challengeId)
    .first()}catch{fail()}
   return row?.challenge_id===challengeId;
  }
 });
}
