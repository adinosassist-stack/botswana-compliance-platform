/**
 * UNMOUNTED SOURCE-ONLY: separately approved isolated private-staging D1 only.
 * Host owns real IdP verification, session/CSRF, invitation and account mapping.
 * No Cloudflare deployment, customer route, production Finance or SQL execution.
 */
const ident=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const hash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const reject=()=>{throw Error("private_one_time_consent_unverified")};
const decoder=new TextDecoder("utf-8",{fatal:true});
const encoder=new TextEncoder();
const MAX_BYTES=131072;
export const ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL=[
 "INSERT INTO essentials_private_one_time_challenges",
 " (challenge_id,tenant_id,quotation_id,customer_id,actor_user_id,",
 " quotation_reference,acceptance_version,total_minor,quotation_sha256,",
 " nonce_sha256,issued_at_ms,expires_at_ms)",
 "SELECT ?,q.tenant_id,q.quotation_id,q.customer_id,?,",
 " q.quotation_reference,q.acceptance_version,q.total_minor,q.quotation_sha256,",
 " ?,?,? FROM essentials_private_frozen_quotes q",
 "WHERE q.tenant_id=? AND q.quotation_id=? AND q.state='accepted'",
 " AND NOT EXISTS (SELECT 1 FROM essentials_private_verified_consents c",
 " WHERE c.tenant_id=q.tenant_id AND c.quotation_id=q.quotation_id)"
].join(" ");
export const ESSENTIALS_PRIVATE_LOAD_CHALLENGE_SQL=[
 "SELECT ch.challenge_id,ch.tenant_id,ch.quotation_id,ch.customer_id,",
 " ch.actor_user_id,ch.quotation_reference,ch.acceptance_version,",
 " ch.total_minor,ch.quotation_sha256,ch.nonce_sha256,",
 " ch.issued_at_ms,ch.expires_at_ms",
 "FROM essentials_private_one_time_challenges ch",
 "JOIN essentials_private_frozen_quotes q",
 " ON q.tenant_id=ch.tenant_id AND q.quotation_id=ch.quotation_id",
 "WHERE ch.challenge_id=? AND ch.tenant_id=? AND ch.quotation_id=?",
 " AND ch.actor_user_id=? AND ch.state='pending'",
 " AND ch.issued_at_ms<=(CAST(strftime('%s','now') AS INTEGER)*1000)",
 " AND ch.expires_at_ms>(CAST(strftime('%s','now') AS INTEGER)*1000)",
 " AND q.state='accepted' AND q.customer_id=ch.customer_id",
 " AND q.quotation_reference=ch.quotation_reference",
 " AND q.acceptance_version=ch.acceptance_version",
 " AND q.total_minor=ch.total_minor AND q.quotation_sha256=ch.quotation_sha256",
 "LIMIT 1"
].join(" ");
export const ESSENTIALS_PRIVATE_COMMIT_CONSENT_SQL=[
 "INSERT INTO essentials_private_capture_attestations",
 "(challenge_id,tenant_id,quotation_id,customer_id,actor_user_id,",
 "quotation_reference,acceptance_version,total_minor,quotation_sha256,",
 "nonce_sha256,consent_sha256,immutable_consent_bytes,consent_subject_id,",
 "accepted_at,accepted_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
].join(" ");
function base64url(bytes){
 let str="";for(const b of bytes)str+=String.fromCharCode(b);
 return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function digest(subtle,bytes){
 let output;try{output=new Uint8Array(await subtle.digest("SHA-256",bytes))}
 catch{reject()}
 if(output.byteLength!==32)reject();
 return Array.from(output,byte=>byte.toString(16).padStart(2,"0")).join("");
}
function parseEvidence(input){
 if(!(input instanceof Uint8Array)||input.byteLength<1||
    input.byteLength>MAX_BYTES)reject();
 let value;try{value=JSON.parse(decoder.decode(input))}catch{reject()}
 if(!value||typeof value!=="object"||Array.isArray(value))reject();
 return value;
}
const validUtc=x=>{
 if(typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x))
   return false;
 const ms=Date.parse(x);
 return Number.isFinite(ms)&&new Date(ms).toISOString().replace(/\.000Z$/,"Z")===x.replace(/\.000Z$/,"Z");
};
export function createEssentialsPrivateOneTimeConsentStore({
 enabled=false,environment,db,cryptoSubtle=globalThis.crypto?.subtle,
 randomBytes,randomUUID,now=()=>Date.now(),authorizeHostSession
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_one_time_consent_disabled");
 if(typeof db?.prepare!=="function"||typeof cryptoSubtle?.digest!=="function"||
    typeof randomBytes!=="function"||typeof randomUUID!=="function"||
    typeof now!=="function"||typeof authorizeHostSession!=="function")
  throw Error("private_one_time_consent_unconfigured");
 const gate=async (principal,quotationId,action,challengeId)=>{
  if(!principal||!ident(principal.tenantId)||!ident(principal.userId)||
     !ident(quotationId))reject();
  let allowed=false;
  try{allowed=await authorizeHostSession({principal,quotationId,action,challengeId})}
  catch{reject()}
  if(allowed!==true)reject();
 };
 return Object.freeze({
  // Host must bind nonce+challengeId to its authenticated session, never a URL.
  async begin({principal,quotationId}={}){
   await gate(principal,quotationId,"begin");
   const at=now();
   if(!Number.isSafeInteger(at)||at<=0)reject();
   let nonceBytes;
   try{nonceBytes=randomBytes(32)}catch{reject()}
   if(!(nonceBytes instanceof Uint8Array)||nonceBytes.byteLength!==32||
      nonceBytes.every(b=>b===0))reject();
   const nonce=base64url(nonceBytes);
   const challengeId=randomUUID();
   if(!ident(challengeId))reject();
   const nonceHash=await digest(cryptoSubtle,encoder.encode(nonce));
   const expiry=at+300000;
   if(!Number.isSafeInteger(expiry))reject();
   let res;
   try{res=await db.prepare(ESSENTIALS_PRIVATE_BEGIN_CHALLENGE_SQL).bind(
     challengeId,principal.userId,nonceHash,at,expiry,
     principal.tenantId,quotationId
   ).run()}catch{reject()}
   if(res?.success!==true||res.meta?.changes!==1)reject();
   return Object.freeze({challengeId,nonce,expiresAtMs:expiry});
  },
  // Only authenticated host may supply nonce from a protected server session.
  async loadOneTimeChallenge({principal,quotationId,challengeId,nonce}={}){
   await gate(principal,quotationId,"read",challengeId);
   if(!ident(challengeId)||typeof nonce!=="string"||
      !/^[A-Za-z0-9_-]{43}$/.test(nonce))reject();
   let raw;try{
    raw=Uint8Array.from(atob(nonce.replace(/-/g,"+").replace(/_/g,"/")+"="),
      x=>x.charCodeAt(0));
   }catch{reject()}
   if(raw.byteLength!==32||base64url(raw)!==nonce)reject();
   const expected=await digest(cryptoSubtle,encoder.encode(nonce));
   let row;
   try{row=await db.prepare(ESSENTIALS_PRIVATE_LOAD_CHALLENGE_SQL)
    .bind(challengeId,principal.tenantId,quotationId,principal.userId).first()}
   catch{reject()}
   if(!row||row.challenge_id!==challengeId||row.tenant_id!==principal.tenantId||
      row.quotation_id!==quotationId||row.actor_user_id!==principal.userId||
      row.nonce_sha256!==expected||!ident(row.customer_id)||
      !ident(row.quotation_reference)||!hash(row.quotation_sha256)||
      !Number.isSafeInteger(row.acceptance_version)||
      !Number.isSafeInteger(row.total_minor)||
      !Number.isSafeInteger(row.issued_at_ms)||
      !Number.isSafeInteger(row.expires_at_ms))reject();
   return Object.freeze({
    challengeId,tenantId:row.tenant_id,quotationId,customerId:row.customer_id,
    actorUserId:row.actor_user_id,quotationReference:row.quotation_reference,
    acceptanceVersion:row.acceptance_version,totalMinor:row.total_minor,
    quotationSha256:row.quotation_sha256,nonce,
    state:"pending",issuedAtMs:row.issued_at_ms,expiresAtMs:row.expires_at_ms
   });
  },
  // Inject ONLY into the trusted verified OIDC capture callback from #2694.
  async commitVerifiedConsent({
   challengeId,tenantId,quotationId,actorUserId,customerId,
   quotationReference,acceptanceVersion,totalMinor,quotationSha256,
   consentSubjectId,immutableConsentBytes,consentSha256,acceptedAt
  }={}){
   if(!ident(challengeId)||!ident(tenantId)||!ident(quotationId)||
      !ident(actorUserId)||!ident(customerId)||!ident(quotationReference)||
      !ident(consentSubjectId)||!hash(quotationSha256)||!hash(consentSha256)||
      !Number.isSafeInteger(acceptanceVersion)||acceptanceVersion<1||
      !Number.isSafeInteger(totalMinor)||totalMinor<0||!validUtc(acceptedAt))
      reject();
   if(!(immutableConsentBytes instanceof Uint8Array))reject();
   const bytes=new Uint8Array(immutableConsentBytes);
   const ev=parseEvidence(bytes);
   if(await digest(cryptoSubtle,bytes)!==consentSha256||
      ev.method!=="oidc-rs256-explicit-accept-v1"||
      ev.decision!=="accept"||ev.challengeId!==challengeId||
      ev.tenantId!==tenantId||ev.quotationId!==quotationId||
      ev.customerId!==customerId||ev.actorUserId!==actorUserId||
      ev.quotationReference!==quotationReference||
      ev.acceptanceVersion!==acceptanceVersion||ev.totalMinor!==totalMinor||
      ev.quotationSha256!==quotationSha256||
      ev.consentSubjectId!==consentSubjectId||ev.acceptedAt!==acceptedAt||
      !hash(ev.challengeNonceSha256)||!hash(ev.identitySubjectSha256)||
      typeof ev.identityIssuer!=="string"||
      !/^https:\/\/[^/\s?#]+/.test(ev.identityIssuer)||
      !validUtc(ev.reauthenticatedAt))reject();
   const acceptedAtMs=Date.parse(acceptedAt);
   if(!Number.isSafeInteger(acceptedAtMs))reject();
   let result;
   try{result=await db.prepare(ESSENTIALS_PRIVATE_COMMIT_CONSENT_SQL).bind(
      challengeId,tenantId,quotationId,customerId,actorUserId,
      quotationReference,acceptanceVersion,totalMinor,quotationSha256,
      ev.challengeNonceSha256,consentSha256,Array.from(bytes),
      consentSubjectId,acceptedAt,acceptedAtMs
    ).run()}catch{reject()}
   // Trigger raises ABORT if consent insertion / challenge consumption fails.
   if(result?.success!==true||!Number.isInteger(result.meta?.changes)||
      result.meta.changes<1)reject();
   return true;
  }
 });
}
