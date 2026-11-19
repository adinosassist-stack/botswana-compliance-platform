/**
 * SOURCE-ONLY, UNMOUNTED isolated-private-staging OIDC token handoff.
 * A successful PKCE callback is NOT consent. Keep the returned, still
 * UNVERIFIED ID token encrypted on the private server until an independently
 * authorized same-origin CSRF-protected explicit acceptance POST.
 * No browser token, public route, IdP or D1 deployment is created here.
 */
const deny=()=>{throw Error("private_oidc_handoff_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const JWT=x=>typeof x==="string"&&x.length>=60&&x.length<=8192&&
 x.split(".").length===3&&x.split(".").every(p=>/^[A-Za-z0-9_-]+$/.test(p));
const te=new TextEncoder(),td=new TextDecoder("utf-8",{fatal:true});
const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const MAX_MS=120000;
export const ESSENTIALS_PRIVATE_SAVE_OIDC_HANDOFF_SQL=[
 "INSERT INTO essentials_private_oidc_token_handoffs",
 "(handoff_key_sha256,session_key_sha256,tenant_id,actor_user_id,quotation_id,",
 "challenge_id,customer_id,token_iv,token_ciphertext,issued_at_ms,expires_at_ms)",
 "SELECT ?,b.session_key_sha256,b.tenant_id,b.actor_user_id,b.quotation_id,",
 "b.challenge_id,b.customer_id,?,?,?,?",
 "FROM essentials_private_session_quotation_challenges AS b",
 "JOIN essentials_private_consent_actor_sessions AS s",
 " ON s.session_key_sha256=b.session_key_sha256",
 "JOIN essentials_private_one_time_challenges AS ch",
 " ON ch.challenge_id=b.challenge_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=b.tenant_id AND q.quotation_id=b.quotation_id",
 "WHERE b.session_key_sha256=? AND b.tenant_id=? AND b.actor_user_id=?",
 "AND b.quotation_id=? AND b.challenge_id=? AND b.customer_id=?",
 "AND b.state='pending' AND s.state='active' AND ch.state='pending'",
 "AND q.state='accepted' AND q.customer_id=b.customer_id",
 "AND q.quotation_sha256=ch.quotation_sha256",
 "AND q.quotation_reference=ch.quotation_reference",
 "AND q.acceptance_version=ch.acceptance_version AND q.total_minor=ch.total_minor",
 "AND ch.tenant_id=b.tenant_id AND ch.actor_user_id=b.actor_user_id",
 "AND ch.customer_id=b.customer_id AND ch.quotation_id=b.quotation_id",
 "AND ch.nonce_sha256=b.nonce_sha256",
 "AND b.expires_at_ms>=? AND b.expires_at_ms>?",
 "AND b.issued_at_ms<="+DB_NOW,
 "AND s.expires_at_ms>"+DB_NOW+" AND s.grant_expires_at_ms>"+DB_NOW,
 "AND ch.expires_at_ms>"+DB_NOW+" AND b.expires_at_ms>"+DB_NOW
].join(" ");
export const ESSENTIALS_PRIVATE_CONSUME_OIDC_HANDOFF_SQL=[
 "UPDATE essentials_private_oidc_token_handoffs",
 "SET state='consumed',consumed_at_ms=?",
 "WHERE handoff_key_sha256=? AND session_key_sha256=?",
 "AND tenant_id=? AND actor_user_id=? AND quotation_id=?",
 "AND challenge_id=? AND state='pending'",
 "AND issued_at_ms<=? AND expires_at_ms>?",
 "AND issued_at_ms<="+DB_NOW+" AND expires_at_ms>"+DB_NOW,
 "AND EXISTS(SELECT 1",
 " FROM essentials_private_session_quotation_challenges AS b",
 " JOIN essentials_private_one_time_challenges AS ch",
 " ON ch.challenge_id=b.challenge_id",
 " JOIN essentials_private_consent_actor_sessions AS s",
 " ON s.session_key_sha256=b.session_key_sha256",
 " JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=b.tenant_id AND q.quotation_id=b.quotation_id",
 " WHERE b.challenge_id=essentials_private_oidc_token_handoffs.challenge_id",
 " AND b.session_key_sha256=essentials_private_oidc_token_handoffs.session_key_sha256",
 " AND b.tenant_id=essentials_private_oidc_token_handoffs.tenant_id",
 " AND b.actor_user_id=essentials_private_oidc_token_handoffs.actor_user_id",
 " AND b.quotation_id=essentials_private_oidc_token_handoffs.quotation_id",
 " AND b.customer_id=essentials_private_oidc_token_handoffs.customer_id",
 " AND b.state='pending' AND ch.state='pending' AND s.state='active'",
 " AND q.state='accepted' AND q.customer_id=b.customer_id",
 " AND ch.tenant_id=b.tenant_id AND ch.actor_user_id=b.actor_user_id",
 " AND ch.customer_id=b.customer_id AND ch.quotation_id=b.quotation_id",
 " AND ch.nonce_sha256=b.nonce_sha256",
 " AND q.quotation_sha256=ch.quotation_sha256",
 " AND q.acceptance_version=ch.acceptance_version",
 " AND q.total_minor=ch.total_minor AND q.quotation_reference=ch.quotation_reference",
 " AND s.expires_at_ms>"+DB_NOW+" AND s.grant_expires_at_ms>"+DB_NOW,
 " AND b.expires_at_ms>"+DB_NOW+" AND ch.expires_at_ms>"+DB_NOW+")",
 "RETURNING handoff_key_sha256,session_key_sha256,tenant_id,actor_user_id,",
 "quotation_id,challenge_id,customer_id,token_iv,token_ciphertext,",
 "issued_at_ms,expires_at_ms,state"
].join(" ");
function bytes(x){
 if(x instanceof Uint8Array)return new Uint8Array(x);
 if(x instanceof ArrayBuffer)return new Uint8Array(x);
 if(Array.isArray(x)&&x.every(v=>Number.isInteger(v)&&v>=0&&v<=255))
  return Uint8Array.from(x);
 deny();
}
function nowMs(now){
 let n;try{n=now()}catch{deny()}
 if(!Number.isSafeInteger(n)||n<=0)deny();
 return n;
}
async function digest(subtle,x){
 let result;try{result=new Uint8Array(await subtle.digest("SHA-256",te.encode(x)))}
 catch{deny()}
 if(result.length!==32)deny();
 return [...result].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function proofKey({sessionKeyHash,challengeId}){
 return JSON.stringify(["thebe-essentials-private-handoff-v1",sessionKeyHash,challengeId]);
}
function aad(row){
 return te.encode(JSON.stringify([
  row.handoffKeySha256,row.sessionKeyHash,row.tenantId,row.actorUserId,
  row.quotationId,row.challengeId,row.customerId,row.issuedAtMs,row.expiresAtMs
 ]));
}
function checkClaim(claim){
 if(!HASH(claim?.sessionKeyHash)||
    ![claim.tenantId,claim.actorUserId,claim.quotationId,claim.challengeId]
      .every(ID))deny();
}
function activeSession(session,claim,at){
 return session?.state==="active"&&
  session.tenantId===claim.tenantId&&session.actorUserId===claim.actorUserId&&
  Number.isSafeInteger(session.expiresAtMs)&&session.expiresAtMs>at;
}
function validBound(b,claim,at){
 return b?.state==="pending"&&b.tenantId===claim.tenantId&&
  b.actorUserId===claim.actorUserId&&b.quotationId===claim.quotationId&&
  b.challengeId===claim.challengeId&&ID(b.customerId)&&
  Number.isSafeInteger(b.expiresAtMs)&&b.expiresAtMs>at;
}
export function createEssentialsPrivateOidcServerTokenHandoff({
 enabled=false,environment,db,tokenEncryptionKey,
 cryptoSubtle=globalThis.crypto?.subtle,randomBytes,now=()=>Date.now(),
 loadActiveSession,loadSessionChallenge,verifyTrustedOidcCompletion,
 authorizeExplicitConsentPost
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_oidc_handoff_disabled");
 if(typeof db?.prepare!=="function"||tokenEncryptionKey?.type!=="secret"||
    tokenEncryptionKey.extractable!==false||
    tokenEncryptionKey.algorithm?.name!=="AES-GCM"||
    tokenEncryptionKey.algorithm?.length!==256||
    !tokenEncryptionKey.usages?.includes("encrypt")||
    !tokenEncryptionKey.usages?.includes("decrypt")||
    typeof cryptoSubtle?.encrypt!=="function"||
    typeof cryptoSubtle?.decrypt!=="function"||
    typeof cryptoSubtle?.digest!=="function"||
    [randomBytes,now,loadActiveSession,loadSessionChallenge,
     verifyTrustedOidcCompletion,authorizeExplicitConsentPost]
      .some(fn=>typeof fn!=="function"))
  throw Error("private_oidc_handoff_unconfigured");
 async function context(claim,at){
  let session,bound;
  try{session=await loadActiveSession({sessionKeyHash:claim.sessionKeyHash})}
  catch{deny()}
  if(!activeSession(session,claim,at))deny();
  try{bound=await loadSessionChallenge(claim)}catch{deny()}
  if(!validBound(bound,claim,at))deny();
  return bound;
 }
 return Object.freeze({
  // Host must obtain callbackResult DIRECTLY from the previously approved
  // PKCE complete() invocation. No customer/browser may post an ID token.
  async recordOidcCallback({sessionKeyHash,callbackResult}={}){
   const claim={
    sessionKeyHash,tenantId:callbackResult?.tenantId,
    actorUserId:callbackResult?.actorUserId,
    quotationId:callbackResult?.quotationId,
    challengeId:callbackResult?.challengeId
   };
   checkClaim(claim);
   if(!JWT(callbackResult.idToken))deny();
   const at=nowMs(now);
   let trusted=false;
   try{trusted=await verifyTrustedOidcCompletion({claim,callbackResult})}
   catch{deny()}
   if(trusted!==true)deny();
   const bound=await context(claim,at);
   const until=Math.min(at+MAX_MS,bound.expiresAtMs);
   if(until<=at)deny();
   const handoffKeySha256=await digest(cryptoSubtle,proofKey(claim));
   const row={...claim,customerId:bound.customerId,handoffKeySha256,
    issuedAtMs:at,expiresAtMs:until};
   let iv;try{iv=randomBytes(12)}catch{deny()}
   if(!(iv instanceof Uint8Array)||iv.length!==12||
      iv.every(x=>x===0))deny();
   let cipher;
   try{cipher=bytes(await cryptoSubtle.encrypt({
    name:"AES-GCM",iv,additionalData:aad(row),tagLength:128
   },tokenEncryptionKey,te.encode(callbackResult.idToken)))}catch{deny()}
   if(cipher.length<17||cipher.length>8300)deny();
   let result;
   try{result=await db.prepare(ESSENTIALS_PRIVATE_SAVE_OIDC_HANDOFF_SQL)
    .bind(handoffKeySha256,Array.from(iv),Array.from(cipher),at,until,
      claim.sessionKeyHash,claim.tenantId,claim.actorUserId,
      claim.quotationId,claim.challengeId,bound.customerId,until,at).run()}
   catch{deny()}
   if(result?.success!==true||result.meta?.changes!==1)deny();
   return Object.freeze({state:"server-held",challengeId:claim.challengeId,
    quotationId:claim.quotationId,expiresAtMs:until});
  },
  // Only the private POST handler AFTER #2697 session, exact origin and CSRF,
  // visible frozen terms+amount, and explicit acceptance can call this.
  // The returned still-UNVERIFIED ID token is NEVER returned to a browser.
  async consumeForExplicitAcceptance(claim){
   checkClaim(claim);
   const at=nowMs(now);
   let allowed=false;
   try{allowed=await authorizeExplicitConsentPost(claim)}catch{deny()}
   if(allowed!==true)deny();
   const bound=await context(claim,at);
   const handoffKeySha256=await digest(cryptoSubtle,proofKey(claim));
   let dbrow;
   try{dbrow=await db.prepare(ESSENTIALS_PRIVATE_CONSUME_OIDC_HANDOFF_SQL)
      .bind(at,handoffKeySha256,claim.sessionKeyHash,
       claim.tenantId,claim.actorUserId,claim.quotationId,
       claim.challengeId,at,at).first()}catch{deny()}
   if(!dbrow)return null;
   const info={
    ...claim,customerId:dbrow.customer_id,handoffKeySha256,
    issuedAtMs:dbrow.issued_at_ms,expiresAtMs:dbrow.expires_at_ms
   };
   if(dbrow.state!=="consumed"||
      dbrow.handoff_key_sha256!==handoffKeySha256||
      dbrow.session_key_sha256!==claim.sessionKeyHash||
      dbrow.tenant_id!==claim.tenantId||
      dbrow.actor_user_id!==claim.actorUserId||
      dbrow.quotation_id!==claim.quotationId||
      dbrow.challenge_id!==claim.challengeId||
      info.customerId!==bound.customerId||
      !Number.isSafeInteger(info.issuedAtMs)||
      !Number.isSafeInteger(info.expiresAtMs)||
      info.issuedAtMs>at||info.expiresAtMs<=at)deny();
   const iv=bytes(dbrow.token_iv),cipher=bytes(dbrow.token_ciphertext);
   if(iv.length!==12||cipher.length<17||cipher.length>8300)deny();
   let raw;try{raw=bytes(await cryptoSubtle.decrypt({
    name:"AES-GCM",iv,additionalData:aad(info),tagLength:128
   },tokenEncryptionKey,cipher))}catch{deny()}
   let idToken;
   try{idToken=td.decode(raw)}catch{deny()}finally{raw.fill(0)}
   if(!JWT(idToken))deny();
   return Object.freeze({idToken,challengeId:claim.challengeId,
    quotationId:claim.quotationId,tenantId:claim.tenantId,
    actorUserId:claim.actorUserId});
  }
 });
}
