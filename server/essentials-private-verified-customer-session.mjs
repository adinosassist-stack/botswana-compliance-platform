/**
 * UNMOUNTED SOURCE ONLY: an OUTSIDE CUSTOMER session, never a Thebe employee
 * session. Does not mount routes, register an IdP, provision invitations,
 * execute D1 SQL or enable real customer-facing quotation acceptance.
 *
 * The host MUST prove an internal OIDC callback and original server-side
 * invitation challenge, not trust values supplied by a browser. Identity
 * token is signature/nonce/fresh-authentication validated here; ownership
 * must be independently proved and current in the Finance source of truth.
 */
const denied=()=>{throw Error("private_customer_session_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HEX=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const OPAQUE=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const MAX_AGE=300000;
const COOKIE="__Host-thebe-customer";
const te=new TextEncoder();
const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
export const ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_INVITE_SQL=[
 "UPDATE essentials_private_customer_consent_invitations",
 "SET state='consumed',consumed_at_ms=?",
 "WHERE invitation_id=? AND tenant_id=? AND customer_id=?",
 "AND quotation_id=? AND nonce_sha256=?",
 "AND state='pending' AND expires_at_ms>=?",
 "AND expires_at_ms>"+DB_NOW,
 "AND EXISTS(SELECT 1 FROM essentials_private_frozen_quotes AS q",
 " WHERE q.tenant_id=tenant_id AND q.quotation_id=quotation_id",
 " AND q.customer_id=customer_id AND q.state='accepted')"
].join(" ");
export const ESSENTIALS_PRIVATE_CREATE_CUSTOMER_SESSION_SQL=[
 "INSERT INTO essentials_private_customer_consent_sessions",
 "(session_key_sha256,csrf_sha256,invitation_id,tenant_id,customer_id,",
 "quotation_id,customer_identity_link_id,consent_subject_id,",
 "identity_subject_hmac_sha256,nonce_sha256,issued_at_ms,expires_at_ms)",
 "SELECT ?,?,?,?,?,?,l.link_id,l.consent_subject_id,?,?,?,?",
 "FROM essentials_private_customer_consent_invitations AS i",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.tenant_id=i.tenant_id AND l.customer_id=i.customer_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=i.tenant_id AND q.quotation_id=i.quotation_id",
 "WHERE i.invitation_id=? AND i.tenant_id=? AND i.customer_id=?",
 "AND i.quotation_id=? AND i.nonce_sha256=?",
 "AND i.state='consumed' AND i.consumed_at_ms=?",
 "AND i.expires_at_ms>=? AND l.expires_at_ms>=?",
 "AND l.state='active' AND l.issuer=? AND l.subject_hmac_sha256=?",
 "AND l.link_id=? AND l.consent_subject_id=?",
 "AND q.state='accepted' AND q.customer_id=i.customer_id",
 "AND i.expires_at_ms>"+DB_NOW+" AND l.expires_at_ms>"+DB_NOW
].join(" ");
export const ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_SESSION_SQL=[
 "INSERT INTO essentials_private_customer_session_issuance_audit",
 "(invitation_id,session_key_sha256,tenant_id,customer_id,",
 "quotation_id,issued_at_ms)",
 "VALUES(?,?,?,?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_READ_CUSTOMER_SESSION_SQL=[
 "SELECT s.session_key_sha256,s.csrf_sha256,s.tenant_id,s.customer_id,",
 "s.quotation_id,s.invitation_id,s.customer_identity_link_id,",
 "s.consent_subject_id,s.identity_subject_hmac_sha256,s.expires_at_ms,",
 "s.state",
 "FROM essentials_private_customer_consent_sessions AS s",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=s.customer_identity_link_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=s.tenant_id AND q.quotation_id=s.quotation_id",
 "WHERE s.session_key_sha256=? AND s.state='active'",
 "AND l.state='active' AND l.issuer=?",
 "AND l.tenant_id=s.tenant_id AND l.customer_id=s.customer_id",
 "AND l.consent_subject_id=s.consent_subject_id",
 "AND l.subject_hmac_sha256=s.identity_subject_hmac_sha256",
 "AND l.expires_at_ms>"+DB_NOW+" AND s.expires_at_ms>"+DB_NOW,
 "AND q.state='accepted' AND q.customer_id=s.customer_id",
 "AND s.expires_at_ms>? LIMIT 1"
].join(" ");
export const ESSENTIALS_PRIVATE_REVOKE_CUSTOMER_SESSION_SQL=[
 "UPDATE essentials_private_customer_consent_sessions",
 "SET state='revoked',revoked_at_ms=?",
 "WHERE session_key_sha256=? AND tenant_id=? AND customer_id=?",
 "AND quotation_id=? AND state='active'",
 "RETURNING session_key_sha256"
].join(" ");
function decode64(seg){
 if(typeof seg!=="string"||!/^[A-Za-z0-9_-]+$/.test(seg))denied();
 let arr;try{
  const raw=atob(seg.replace(/-/g,"+").replace(/_/g,"/")+
    "=".repeat((4-seg.length%4)%4));
  arr=Uint8Array.from(raw,c=>c.charCodeAt(0));
 }catch{denied()}
 if(base64url(arr)!==seg)denied();
 return arr;
}
function base64url(bytes){
 let raw="";for(const b of bytes)raw+=String.fromCharCode(b);
 return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function parsePart(part){
 let x;try{x=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(decode64(part)))}
 catch{denied()}
 if(!x||typeof x!=="object"||Array.isArray(x))denied();
 return x;
}
function randomToken(randomBytes){
 let bytes;try{bytes=randomBytes(32)}catch{denied()}
 if(!(bytes instanceof Uint8Array)||bytes.length!==32||
    bytes.every(x=>x===0))denied();
 return base64url(bytes);
}
async function sha(subtle,str){
 let raw;try{raw=new Uint8Array(await subtle.digest("SHA-256",te.encode(str)))}
 catch{denied()}
 if(raw.length!==32)denied();
 return [...raw].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function safeNow(now){
 let at;try{at=now()}catch{denied()}
 if(!Number.isSafeInteger(at)||at<=0)denied();
 return at;
}
async function verifyJwt(subtle,publicKey,token,nonce,at,issuer,audience,keyId,issuedAtMs){
 if(typeof token!=="string"||token.length<60||token.length>8192)denied();
 const parts=token.split(".");
 if(parts.length!==3)denied();
 const header=parsePart(parts[0]),claims=parsePart(parts[1]);
 if(Object.keys(header).length!==3||header.alg!=="RS256"||
    header.typ!=="JWT"||header.kid!==keyId)denied();
 const sig=decode64(parts[2]);
 if(sig.length<256)denied();
 let valid=false;
 try{valid=await subtle.verify("RSASSA-PKCS1-v1_5",
  publicKey,sig,te.encode(parts[0]+"."+parts[1]))}catch{denied()}
 if(valid!==true)denied();
 const sec=Math.floor(at/1000),startSec=Math.floor(issuedAtMs/1000);
 if(claims.iss!==issuer||claims.aud!==audience||
   typeof claims.sub!=="string"||claims.sub.length<1||claims.sub.length>160||
   !/^[A-Za-z0-9._:@|-]+$/.test(claims.sub)||
   claims.nonce!==nonce||
   !Number.isSafeInteger(claims.iat)||
   !Number.isSafeInteger(claims.exp)||
   !Number.isSafeInteger(claims.auth_time)||
   claims.exp<=sec||claims.iat>sec+60||
   claims.auth_time>sec+60||claims.iat<startSec-60||
   claims.auth_time<startSec-60||sec-claims.iat>300||
   sec-claims.auth_time>300||
   (claims.nbf!==undefined&&
    (!Number.isSafeInteger(claims.nbf)||claims.nbf>sec+60)))denied();
 return claims;
}
function validIssuer(x){
 if(typeof x!=="string"||x.length>250) return false;
 try{
  const u=new URL(x);
  return u.protocol==="https:"&&!u.username&&!u.password&&
   !u.search&&!u.hash&&(x===u.origin||x===u.href);
 }catch{return false}
}
export function createEssentialsPrivateVerifiedCustomerSession({
 enabled=false,environment,db,issuer,audience,keyId,publicKey,
 cryptoSubtle=globalThis.crypto?.subtle,
 randomBytes,now=()=>Date.now(),
 loadTrustedCustomerInvitation,verifyTrustedCustomerCallback,
 resolveCustomerAccountLink,verifyCurrentCustomerOwnership,
 authorizeCustomerSessionRevocation
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_customer_session_disabled");
 if(typeof db?.prepare!=="function"||typeof db?.batch!=="function"||
  !validIssuer(issuer)||typeof audience!=="string"||
  audience.length<1||audience.length>200||
  !/^[A-Za-z0-9_.:-]{1,100}$/.test(keyId)||
  publicKey?.type!=="public"||
  publicKey?.algorithm?.name!=="RSASSA-PKCS1-v1_5"||
  publicKey?.algorithm?.hash?.name!=="SHA-256"||
  publicKey?.algorithm?.modulusLength<2048||
  !publicKey.usages?.includes("verify")||
  typeof cryptoSubtle?.verify!=="function"||
  typeof cryptoSubtle?.digest!=="function"||
  [randomBytes,now,loadTrustedCustomerInvitation,
   verifyTrustedCustomerCallback,resolveCustomerAccountLink,
   verifyCurrentCustomerOwnership,authorizeCustomerSessionRevocation]
   .some(f=>typeof f!=="function"))
  throw Error("private_customer_session_unconfigured");
 const readSession=async ({sessionKeyHash}={})=>{
  if(!HEX(sessionKeyHash))denied();
  const at=safeNow(now);
  let r;
  try{r=await db.prepare(ESSENTIALS_PRIVATE_READ_CUSTOMER_SESSION_SQL)
     .bind(sessionKeyHash,issuer,at).first()}catch{denied()}
  if(!r)return null;
  if(r.session_key_sha256!==sessionKeyHash||r.state!=="active"||
   !HEX(r.csrf_sha256)||!HEX(r.identity_subject_hmac_sha256)||
   ![r.tenant_id,r.customer_id,r.quotation_id,r.invitation_id,
     r.customer_identity_link_id,r.consent_subject_id].every(ID)||
   !Number.isSafeInteger(r.expires_at_ms)||r.expires_at_ms<=at)denied();
  let verified=false;
  try{verified=await verifyCurrentCustomerOwnership({
   tenantId:r.tenant_id,customerId:r.customer_id,
   quotationId:r.quotation_id,invitationId:r.invitation_id,
   linkId:r.customer_identity_link_id,
   consentSubjectId:r.consent_subject_id,
   identitySubjectHmacSha256:r.identity_subject_hmac_sha256
  })}catch{denied()}
  if(verified!==true)return null;
  return Object.freeze({
   state:"active",role:"customer",tenantId:r.tenant_id,
   customerId:r.customer_id,quotationId:r.quotation_id,
   invitationId:r.invitation_id,
   customerIdentityLinkId:r.customer_identity_link_id,
   csrfSha256:r.csrf_sha256,expiresAtMs:r.expires_at_ms
  });
 };
 return Object.freeze({
  // Trusted host must supply invitationId and idToken from an internal
  // protected server callback, not from browser-supplied tenant/customer IDs.
  async issueVerifiedCustomerSession({invitationId,idToken}={}){
   if(!ID(invitationId))denied();
   const at=safeNow(now);
   let invite;
   try{invite=await loadTrustedCustomerInvitation({invitationId})}
   catch{denied()}
   if(!invite||invite.state!=="pending"||invite.invitationId!==invitationId||
    ![invite.tenantId,invite.customerId,invite.quotationId].every(ID)||
    !OPAQUE(invite.nonce)||
    !Number.isSafeInteger(invite.issuedAtMs)||
    !Number.isSafeInteger(invite.expiresAtMs)||
    invite.issuedAtMs>at||invite.expiresAtMs<=at||
    invite.expiresAtMs-invite.issuedAtMs>MAX_AGE)denied();
   let trusted=false;
   try{trusted=await verifyTrustedCustomerCallback({
    invitationId,tenantId:invite.tenantId,
    customerId:invite.customerId,quotationId:invite.quotationId,
    nonce:invite.nonce,idToken
   })}catch{denied()}
   if(trusted!==true)denied();
   const claims=await verifyJwt(cryptoSubtle,publicKey,idToken,
     invite.nonce,at,issuer,audience,keyId,invite.issuedAtMs);
   let link;
   try{link=await resolveCustomerAccountLink({
    issuer,subject:claims.sub,tenantId:invite.tenantId,
    customerId:invite.customerId,quotationId:invite.quotationId
   })}catch{denied()}
   if(link?.linked!==true||!ID(link.customerIdentityLinkId)||
      !ID(link.consentSubjectId)||
      !HEX(link.identitySubjectHmacSha256))denied();
   let owned=false;
   try{owned=await verifyCurrentCustomerOwnership({
    tenantId:invite.tenantId,customerId:invite.customerId,
    quotationId:invite.quotationId,invitationId,
    linkId:link.customerIdentityLinkId,
    consentSubjectId:link.consentSubjectId,
    identitySubjectHmacSha256:link.identitySubjectHmacSha256
   })}catch{denied()}
   if(owned!==true)denied();
   const expiry=Math.min(at+MAX_AGE,invite.expiresAtMs,
      claims.exp*1000);
   if(!Number.isSafeInteger(expiry)||expiry-at<1000)denied();
   const cookie=randomToken(randomBytes),csrf=randomToken(randomBytes);
   if(cookie===csrf)denied();
   const [sessionHash,csrfHash,nonceHash]=await Promise.all([
    sha(cryptoSubtle,cookie),sha(cryptoSubtle,csrf),
    sha(cryptoSubtle,invite.nonce)
   ]);
   let results;
   try{
    results=await db.batch([
     db.prepare(ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_INVITE_SQL).bind(
      at,invitationId,invite.tenantId,invite.customerId,
      invite.quotationId,nonceHash,expiry
     ),
     db.prepare(ESSENTIALS_PRIVATE_CREATE_CUSTOMER_SESSION_SQL).bind(
      sessionHash,csrfHash,invitationId,invite.tenantId,invite.customerId,
      invite.quotationId,link.identitySubjectHmacSha256,
      nonceHash,at,expiry,
      invitationId,invite.tenantId,invite.customerId,invite.quotationId,
      nonceHash,at,expiry,expiry,
      issuer,link.identitySubjectHmacSha256,link.customerIdentityLinkId,
      link.consentSubjectId
     ),
     db.prepare(ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_SESSION_SQL).bind(
      invitationId,sessionHash,invite.tenantId,invite.customerId,
      invite.quotationId,at
     )
    ]);
   }catch{denied()}
   if(!Array.isArray(results)||results.length!==3||
     results.some(r=>r?.success!==true||r.meta?.changes!==1))denied();
   const age=Math.floor((expiry-at)/1000);
   if(age<1)denied();
   return Object.freeze({
    role:"customer",expiresAtMs:expiry,
    setCookie:COOKIE+"="+cookie+
     "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age="+age,
    csrfToken:csrf
   });
  },
  loadActiveCustomerSession:readSession,
  async revokeCustomerSession({
   sessionKeyHash,tenantId,customerId,quotationId
  }={}){
   if(!HEX(sessionKeyHash)||
    ![tenantId,customerId,quotationId].every(ID))denied();
   let allowed=false;
   try{allowed=await authorizeCustomerSessionRevocation({
    sessionKeyHash,tenantId,customerId,quotationId
   })}catch{denied()}
   if(allowed!==true)denied();
   const at=safeNow(now);
   let r;
   try{r=await db.prepare(ESSENTIALS_PRIVATE_REVOKE_CUSTOMER_SESSION_SQL)
    .bind(at,sessionKeyHash,tenantId,customerId,quotationId).first()}
   catch{denied()}
   return r?.session_key_sha256===sessionKeyHash;
  }
 });
}
