/**
 * SOURCE-ONLY, UNMOUNTED, ISOLATED-PRIVATE-STAGING browser session candidate.
 * Does NOT authenticate a customer, create an HTTP route or configure D1.
 * A server-authenticated, independently approved tenant-actor GRANT must
 * precede minting. Issued session represents the TENANT ACTOR ONLY, never
 * the real customer's OIDC identity or authority to accept a quotation.
 */
const reject=()=>{throw Error("private_consent_session_store_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const SHA=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const COOKIE="__Host-thebe-consent";
const MAX_AGE_MS=10*60_000;
const te=new TextEncoder();
const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";

export const ESSENTIALS_PRIVATE_CREATE_SESSION_SQL=[
 "INSERT INTO essentials_private_consent_actor_sessions",
 "(session_key_sha256,csrf_sha256,tenant_id,actor_user_id,grant_id,",
 "issued_at_ms,grant_expires_at_ms,expires_at_ms)",
 "VALUES(?,?,?,?,?,?,?,?)"
].join(" ");

export const ESSENTIALS_PRIVATE_READ_SESSION_SQL=[
 "SELECT session_key_sha256,csrf_sha256,tenant_id,actor_user_id,",
 "grant_id,issued_at_ms,grant_expires_at_ms,expires_at_ms,state",
 "FROM essentials_private_consent_actor_sessions",
 "WHERE session_key_sha256=? AND state='active'",
 "AND issued_at_ms<=? AND grant_expires_at_ms>? AND expires_at_ms>?",
 "AND issued_at_ms<="+DB_NOW,
 "AND grant_expires_at_ms>"+DB_NOW+" AND expires_at_ms>"+DB_NOW,
 "LIMIT 1"
].join(" ");

export const ESSENTIALS_PRIVATE_REVOKE_SESSION_SQL=[
 "UPDATE essentials_private_consent_actor_sessions",
 "SET state='revoked',revoked_at_ms=?",
 "WHERE session_key_sha256=? AND tenant_id=? AND actor_user_id=?",
 "AND state='active'",
 "RETURNING session_key_sha256"
].join(" ");

function generate(randomBytes){
 let bytes;
 try{bytes=randomBytes(32)}catch{reject()}
 if(!(bytes instanceof Uint8Array)||bytes.length!==32||
    bytes.every(n=>n===0))reject();
 let raw="";
 for(const byte of bytes)raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function digest(subtle,value){
 let d;
 try{d=new Uint8Array(await subtle.digest("SHA-256",te.encode(value)))}
 catch{reject()}
 if(d.length!==32)reject();
 return Array.from(d,n=>n.toString(16).padStart(2,"0")).join("");
}
function currentClock(now){
 let at;
 try{at=now()}catch{reject()}
 if(!Number.isSafeInteger(at)||at<=0)reject();
 return at;
}
const validGrant=g=>g&&ID(g.grantId)&&ID(g.tenantId)&&
 ID(g.actorUserId)&&Number.isSafeInteger(g.expiresAtMs)&&g.expiresAtMs>0;

export function createEssentialsPrivateConsentActorSessionStore({
 enabled=false,environment,db,cryptoSubtle=globalThis.crypto?.subtle,
 randomBytes,now=()=>Date.now(),
 verifyCurrentActorGrant,authorizeSessionRevocation
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_consent_session_store_disabled");
 if(typeof db?.prepare!=="function"||
    typeof cryptoSubtle?.digest!=="function"||
    typeof randomBytes!=="function"||typeof now!=="function"||
    typeof verifyCurrentActorGrant!=="function"||
    typeof authorizeSessionRevocation!=="function")
  throw Error("private_consent_session_store_unconfigured");

 async function checkGrant(grant,operation){
  let verified=false;
  try{verified=await verifyCurrentActorGrant({
    grantId:grant.grantId,tenantId:grant.tenantId,
    actorUserId:grant.actorUserId,operation
  })}catch{reject()}
  return verified===true;
 }
 async function read({sessionKeyHash}={}){
  if(!SHA(sessionKeyHash))reject();
  const at=currentClock(now);
  let row;
  try{row=await db.prepare(ESSENTIALS_PRIVATE_READ_SESSION_SQL)
    .bind(sessionKeyHash,at,at,at).first()}
  catch{reject()}
  if(!row)return null;
  if(row.session_key_sha256!==sessionKeyHash||
     row.state!=="active"||
     !SHA(row.csrf_sha256)||!ID(row.tenant_id)||
     !ID(row.actor_user_id)||!ID(row.grant_id)||
     !Number.isSafeInteger(row.issued_at_ms)||
     !Number.isSafeInteger(row.expires_at_ms)||
     !Number.isSafeInteger(row.grant_expires_at_ms)||
     row.issued_at_ms>at||row.expires_at_ms<=at||
     row.grant_expires_at_ms<=at||
     row.expires_at_ms>row.grant_expires_at_ms||
     row.expires_at_ms-row.issued_at_ms>MAX_AGE_MS)
    reject();
  const g={grantId:row.grant_id,tenantId:row.tenant_id,
    actorUserId:row.actor_user_id};
  // A D1 session row is not current role/tenant authorization by itself.
  if(!await checkGrant(g,"session-read"))return null;
  return Object.freeze({
    state:"active",tenantId:g.tenantId,actorUserId:g.actorUserId,
    grantId:g.grantId,csrfSha256:row.csrf_sha256,
    expiresAtMs:row.expires_at_ms
  });
 }

 return Object.freeze({
  // DO NOT expose to unauthenticated HTTP. The private host must obtain the
  // verified grant from an independently authenticated backend identity/role
  // authority. Browser-provided grant objects are FORBIDDEN.
  async issueSession({grant}={}){
   if(!validGrant(grant))reject();
   const at=currentClock(now);
   if(grant.expiresAtMs<=at||!await checkGrant(grant,"session-issue"))reject();
   const sessionToken=generate(randomBytes);
   const csrfToken=generate(randomBytes);
   if(sessionToken===csrfToken)reject();
   const [sessionKeyHash,csrfSha256]=await Promise.all([
     digest(cryptoSubtle,sessionToken),digest(cryptoSubtle,csrfToken)
   ]);
   const expiresAtMs=Math.min(at+MAX_AGE_MS,grant.expiresAtMs);
   const maxAge=Math.floor((expiresAtMs-at)/1000);
   if(maxAge<1||!Number.isSafeInteger(expiresAtMs))reject();
   let result;
   try{result=await db.prepare(ESSENTIALS_PRIVATE_CREATE_SESSION_SQL)
      .bind(sessionKeyHash,csrfSha256,grant.tenantId,grant.actorUserId,
        grant.grantId,at,grant.expiresAtMs,expiresAtMs).run()}
   catch{reject()}
   if(result?.success!==true||result.meta?.changes!==1)reject();
   return Object.freeze({
     // Host must send Set-Cookie only over HTTPS, mark response no-store, and
     // deliver CSRF token inside a protected same-origin page (not URL/logs).
     setCookie:COOKIE+"="+sessionToken+
       "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age="+maxAge,
     csrfToken,expiresAtMs
   });
  },
  // Used by #2697's loadActiveSession callback. Caller should pass only
  // SHA-256 of an opaque cookie, never a user/client/tenant claim.
  loadActiveSession:read,
  // Compatible with #2701's verifyActiveSession callback. Only a current
  // tenant actor session is proven, never external customer login.
  async verifyActiveSession({
   sessionKeyHash,tenantId,actorUserId,operation
  }={}){
   if(!SHA(sessionKeyHash)||!ID(tenantId)||!ID(actorUserId)||
      !["oidc-begin","oidc-complete"].includes(operation))return false;
   const row=await read({sessionKeyHash});
   return row?.tenantId===tenantId&&row.actorUserId===actorUserId;
  },
  // Only an independently authorized server revocation (logout/admin)
  // can transition current state to revoked. Never let browser tenant
  // strings authorize revocation.
  async revokeSession({sessionKeyHash,tenantId,actorUserId}={}){
   if(!SHA(sessionKeyHash)||!ID(tenantId)||!ID(actorUserId))reject();
   let allowed=false;
   try{allowed=await authorizeSessionRevocation({
     sessionKeyHash,tenantId,actorUserId
   })}catch{reject()}
   if(allowed!==true)reject();
   const at=currentClock(now);
   let row;
   try{row=await db.prepare(ESSENTIALS_PRIVATE_REVOKE_SESSION_SQL)
      .bind(at,sessionKeyHash,tenantId,actorUserId).first()}
   catch{reject()}
   return row?.session_key_sha256===sessionKeyHash;
  }
 });
}
