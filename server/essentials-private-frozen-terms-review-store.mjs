/**
 * SOURCE ONLY, UNMOUNTED isolated-private-staging:
 * (1) transactionally freeze quotation AND complete contract terms;
 * (2) read the authoritative paired immutable bytes; and
 * (3) offer (NOT prove read/consent) review to the genuine customer session.
 * No D1 migrations, routes, real identities or Finance operations.
 */
const deny=()=>{throw Error("private_frozen_terms_review_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const MAX_QUOTE=131072,MAX_TERMS=65536,MAX_OFFER_MS=300000;
const te=new TextEncoder();
const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";

export const ESSENTIALS_PRIVATE_FREEZE_QUOTE_WITH_TERMS_SQL=[
 "INSERT INTO essentials_private_frozen_quotes",
 "(tenant_id,quotation_id,customer_id,quotation_reference,",
 "acceptance_version,total_minor,quotation_sha256,",
 "immutable_quotation_bytes,frozen_by_actor_user_id,frozen_at)",
 "VALUES(?,?,?,?,?,?,?,?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_BIND_IMMUTABLE_TERMS_SQL=[
 "INSERT INTO essentials_private_frozen_quote_terms",
 "(tenant_id,quotation_id,customer_id,quotation_reference,",
 "acceptance_version,total_minor,quotation_sha256,",
 "terms_sha256,immutable_terms_bytes,frozen_at)",
 "SELECT q.tenant_id,q.quotation_id,q.customer_id,q.quotation_reference,",
 "q.acceptance_version,q.total_minor,q.quotation_sha256,?,?,q.frozen_at",
 "FROM essentials_private_frozen_quotes AS q",
 "WHERE q.tenant_id=? AND q.quotation_id=? AND q.customer_id=?",
 "AND q.quotation_reference=? AND q.acceptance_version=?",
 "AND q.total_minor=? AND q.quotation_sha256=? AND q.frozen_at=?",
 "AND q.state='accepted'"
].join(" ");
export const ESSENTIALS_PRIVATE_ASSERT_FROZEN_TERMS_SQL=[
 "INSERT INTO essentials_private_frozen_quote_terms_audit",
 "(tenant_id,quotation_id,quotation_sha256,terms_sha256,frozen_at)",
 "VALUES(?,?,?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_READ_CUSTOMER_FROZEN_TERMS_SQL=[
 "SELECT q.tenant_id,q.quotation_id,q.customer_id,q.quotation_reference,",
 "q.acceptance_version,q.total_minor,q.quotation_sha256,",
 "q.immutable_quotation_bytes,t.terms_sha256,t.immutable_terms_bytes",
 "FROM essentials_private_frozen_quotes AS q",
 "JOIN essentials_private_frozen_quote_terms AS t",
 " ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id",
 "JOIN essentials_private_frozen_quote_terms_audit AS a",
 " ON a.tenant_id=q.tenant_id AND a.quotation_id=q.quotation_id",
 "WHERE q.tenant_id=? AND q.customer_id=? AND q.quotation_id=?",
 "AND q.state='accepted' AND t.customer_id=q.customer_id",
 "AND t.quotation_reference=q.quotation_reference",
 "AND t.acceptance_version=q.acceptance_version",
 "AND t.total_minor=q.total_minor",
 "AND t.quotation_sha256=q.quotation_sha256",
 "AND t.frozen_at=q.frozen_at",
 "AND a.quotation_sha256=q.quotation_sha256",
 "AND a.terms_sha256=t.terms_sha256",
 "AND a.frozen_at=q.frozen_at",
 "LIMIT 1"
].join(" ");

export const ESSENTIALS_PRIVATE_INSERT_CUSTOMER_REVIEW_OFFER_SQL=[
 "INSERT INTO essentials_private_customer_quote_review_offers",
 "(presentation_id,session_key_sha256,customer_identity_link_id,",
 "tenant_id,customer_id,quotation_id,quotation_sha256,terms_sha256,",
 "acceptance_version,total_minor,issued_at_ms,expires_at_ms)",
 "SELECT ?,s.session_key_sha256,s.customer_identity_link_id,",
 "s.tenant_id,s.customer_id,s.quotation_id,q.quotation_sha256,",
 "t.terms_sha256,q.acceptance_version,q.total_minor,?,?",
 "FROM essentials_private_customer_consent_sessions AS s",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=s.customer_identity_link_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=s.tenant_id AND q.quotation_id=s.quotation_id",
 "JOIN essentials_private_frozen_quote_terms AS t",
 " ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id",
 "JOIN essentials_private_frozen_quote_terms_audit AS a",
 " ON a.tenant_id=q.tenant_id AND a.quotation_id=q.quotation_id",
 "WHERE s.session_key_sha256=? AND s.tenant_id=? AND s.customer_id=?",
 "AND s.quotation_id=? AND s.state='active'",
 "AND s.expires_at_ms>=? AND s.expires_at_ms>"+DB_NOW,
 "AND l.state='active' AND l.expires_at_ms>"+DB_NOW,
 "AND l.tenant_id=s.tenant_id AND l.customer_id=s.customer_id",
 "AND l.consent_subject_id=s.consent_subject_id",
 "AND l.subject_hmac_sha256=s.identity_subject_hmac_sha256",
 "AND q.state='accepted' AND q.customer_id=s.customer_id",
 "AND q.quotation_sha256=? AND t.terms_sha256=?",
 "AND q.acceptance_version=? AND q.total_minor=?",
 "AND t.quotation_sha256=q.quotation_sha256",
 "AND t.customer_id=q.customer_id",
 "AND t.quotation_reference=q.quotation_reference",
 "AND t.acceptance_version=q.acceptance_version",
 "AND t.total_minor=q.total_minor AND t.frozen_at=q.frozen_at",
 "AND a.quotation_sha256=q.quotation_sha256",
 "AND a.terms_sha256=t.terms_sha256 AND a.frozen_at=q.frozen_at"
].join(" ");
export const ESSENTIALS_PRIVATE_READ_CUSTOMER_REVIEW_OFFER_SQL=[
 "SELECT o.presentation_id,o.session_key_sha256,o.tenant_id,",
 "o.customer_id,o.quotation_id,o.quotation_sha256,o.terms_sha256,",
 "o.acceptance_version,o.total_minor,o.issued_at_ms,o.expires_at_ms,",
 "o.customer_identity_link_id,o.state",
 "FROM essentials_private_customer_quote_review_offers AS o",
 "JOIN essentials_private_customer_consent_sessions AS s",
 " ON s.session_key_sha256=o.session_key_sha256",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=s.customer_identity_link_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=o.tenant_id AND q.quotation_id=o.quotation_id",
 "JOIN essentials_private_frozen_quote_terms AS t",
 " ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id",
 "JOIN essentials_private_frozen_quote_terms_audit AS a",
 " ON a.tenant_id=q.tenant_id AND a.quotation_id=q.quotation_id",
 "WHERE o.presentation_id=? AND o.session_key_sha256=?",
 "AND o.tenant_id=? AND o.customer_id=? AND o.quotation_id=?",
 "AND o.state='offered' AND o.issued_at_ms<=? AND o.expires_at_ms>?",
 "AND o.issued_at_ms<="+DB_NOW+" AND o.expires_at_ms>"+DB_NOW,
 "AND s.state='active' AND s.expires_at_ms>"+DB_NOW,
 "AND s.tenant_id=o.tenant_id AND s.customer_id=o.customer_id",
 "AND s.quotation_id=o.quotation_id",
 "AND s.customer_identity_link_id=o.customer_identity_link_id",
 "AND l.state='active' AND l.expires_at_ms>"+DB_NOW,
 "AND l.tenant_id=s.tenant_id AND l.customer_id=s.customer_id",
 "AND l.consent_subject_id=s.consent_subject_id",
 "AND l.subject_hmac_sha256=s.identity_subject_hmac_sha256",
 "AND q.state='accepted' AND q.customer_id=o.customer_id",
 "AND q.quotation_sha256=o.quotation_sha256",
 "AND q.acceptance_version=o.acceptance_version",
 "AND q.total_minor=o.total_minor",
 "AND t.terms_sha256=o.terms_sha256",
 "AND t.quotation_sha256=q.quotation_sha256",
 "AND t.customer_id=q.customer_id",
 "AND t.quotation_reference=q.quotation_reference",
 "AND t.acceptance_version=q.acceptance_version",
 "AND t.total_minor=q.total_minor AND t.frozen_at=q.frozen_at",
 "AND a.quotation_sha256=q.quotation_sha256",
 "AND a.terms_sha256=t.terms_sha256 AND a.frozen_at=q.frozen_at",
 "LIMIT 1"
].join(" ");

function trustedClock(now){
 let t;try{t=now()}catch{deny()}
 if(!Number.isSafeInteger(t)||t<=0)deny();
 return t;
}
function copiedBytes(x,limit){
 let b;
 if(x instanceof Uint8Array)b=new Uint8Array(x);
 else if(x instanceof ArrayBuffer)b=new Uint8Array(x.slice(0));
 else if(Array.isArray(x)&&x.every(v=>Number.isInteger(v)&&v>=0&&v<=255))
  b=Uint8Array.from(x);
 else deny();
 if(b.length<1||b.length>limit)deny();
 return b;
}
async function sha(subtle,b){
 let digest;
 try{digest=new Uint8Array(await subtle.digest("SHA-256",b))}catch{deny()}
 if(digest.length!==32)deny();
 return [...digest].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function b64(x){
 let s="";for(const n of x)s+=String.fromCharCode(n);
 return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function idFromRandom(randomBytes){
 let v;try{v=randomBytes(24)}catch{deny()}
 if(!(v instanceof Uint8Array)||v.length!==24||v.every(n=>n===0))deny();
 return b64(v);
}
function parseFreeze(input){
 if(!input||![input.tenantId,input.quotationId,input.customerId,
   input.quotationReference,input.frozenByActorUserId].every(ID)||
   !Number.isSafeInteger(input.acceptanceVersion)||
   input.acceptanceVersion<1||input.acceptanceVersion>2147483647||
   !Number.isSafeInteger(input.totalMinor)||input.totalMinor<0)deny();
 return {
  tenantId:input.tenantId,quotationId:input.quotationId,
  customerId:input.customerId,quotationReference:input.quotationReference,
  frozenByActorUserId:input.frozenByActorUserId,
  acceptanceVersion:input.acceptanceVersion,totalMinor:input.totalMinor,
  quoteBytes:copiedBytes(input.immutableQuotationBytes,MAX_QUOTE),
  termsBytes:copiedBytes(input.immutableTermsBytes,MAX_TERMS)
 };
}
function goodSession(s,params,at){
 return s?.state==="active"&&s.role==="customer"&&
  s.tenantId===params.tenantId&&s.customerId===params.customerId&&
  s.quotationId===params.quotationId&&ID(s.customerIdentityLinkId)&&
  Number.isSafeInteger(s.expiresAtMs)&&s.expiresAtMs>at;
}
export function createEssentialsPrivateFrozenTermsReviewStore({
 enabled=false,environment,db,randomBytes,now=()=>Date.now(),
 cryptoSubtle=globalThis.crypto?.subtle,
 authorizeAuthoritativeFreeze,loadActiveCustomerSession,
 authorizeCustomerReviewOffer
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_frozen_terms_review_disabled");
 if(typeof db?.prepare!=="function"||typeof db?.batch!=="function"||
  typeof randomBytes!=="function"||typeof now!=="function"||
  typeof cryptoSubtle?.digest!=="function"||
  [authorizeAuthoritativeFreeze,loadActiveCustomerSession,
    authorizeCustomerReviewOffer].some(x=>typeof x!=="function"))
  throw Error("private_frozen_terms_review_unconfigured");

 async function loadFrozenCustomerQuote({tenantId,customerId,quotationId}={}){
  if(![tenantId,customerId,quotationId].every(ID))deny();
  let r;
  try{r=await db.prepare(ESSENTIALS_PRIVATE_READ_CUSTOMER_FROZEN_TERMS_SQL)
   .bind(tenantId,customerId,quotationId).first()}catch{deny()}
  if(!r)return null; // no complete authoritative freeze: fail closed upstream
  if(r.tenant_id!==tenantId||r.customer_id!==customerId||
     r.quotation_id!==quotationId||!ID(r.quotation_reference)||
     !Number.isSafeInteger(r.acceptance_version)||
     r.acceptance_version<1||r.acceptance_version>2147483647||
     !Number.isSafeInteger(r.total_minor)||r.total_minor<0||
     !HASH(r.quotation_sha256)||!HASH(r.terms_sha256))deny();
  const quoteBytes=copiedBytes(r.immutable_quotation_bytes,MAX_QUOTE);
  const termsBytes=copiedBytes(r.immutable_terms_bytes,MAX_TERMS);
  if(await sha(cryptoSubtle,quoteBytes)!==r.quotation_sha256||
     await sha(cryptoSubtle,termsBytes)!==r.terms_sha256)deny();
  return Object.freeze({
   state:"accepted",tenantId,customerId,quotationId,
   quotationReference:r.quotation_reference,
   acceptanceVersion:r.acceptance_version,totalMinor:r.total_minor,
   quotationSha256:r.quotation_sha256,termsSha256:r.terms_sha256,
   immutableQuotationBytes:quoteBytes,immutableTermsBytes:termsBytes
  });
 }
 async function currentSession(params,at){
  let s;
  try{s=await loadActiveCustomerSession({sessionKeyHash:params.sessionKeyHash})}
  catch{deny()}
  if(!goodSession(s,params,at))deny();
  return s;
 }
 return Object.freeze({
  // This is a trusted PRIVATE AUTHORITATIVE FREEZE host, never a customer
  // POST or an arbitrary employee/browser-supplied quote. Source-of-truth
  // bytes and full terms must be independently checked by the callback.
  async freezeQuotationWithTerms({source}={}){
   const q=parseFreeze(source),at=trustedClock(now);
   const frozenAt=new Date(at).toISOString();
   const [quotationSha256,termsSha256]=await Promise.all([
    sha(cryptoSubtle,q.quoteBytes),sha(cryptoSubtle,q.termsBytes)
   ]);
   const scope={tenantId:q.tenantId,quotationId:q.quotationId,
    customerId:q.customerId,quotationReference:q.quotationReference,
    acceptanceVersion:q.acceptanceVersion,totalMinor:q.totalMinor,
    frozenByActorUserId:q.frozenByActorUserId,quotationSha256,
    termsSha256,immutableQuotationBytes:new Uint8Array(q.quoteBytes),
    immutableTermsBytes:new Uint8Array(q.termsBytes)};
   let authorized=false;
   try{authorized=await authorizeAuthoritativeFreeze(scope)}catch{deny()}
   if(authorized!==true)deny();
   let results;
   try{
    results=await db.batch([
     db.prepare(ESSENTIALS_PRIVATE_FREEZE_QUOTE_WITH_TERMS_SQL).bind(
      q.tenantId,q.quotationId,q.customerId,q.quotationReference,
      q.acceptanceVersion,q.totalMinor,quotationSha256,
      Array.from(q.quoteBytes),q.frozenByActorUserId,frozenAt
     ),
     db.prepare(ESSENTIALS_PRIVATE_BIND_IMMUTABLE_TERMS_SQL).bind(
      termsSha256,Array.from(q.termsBytes),
      q.tenantId,q.quotationId,q.customerId,q.quotationReference,
      q.acceptanceVersion,q.totalMinor,quotationSha256,frozenAt
     ),
     db.prepare(ESSENTIALS_PRIVATE_ASSERT_FROZEN_TERMS_SQL).bind(
      q.tenantId,q.quotationId,quotationSha256,termsSha256,frozenAt
     )
    ]);
   }catch{deny()}
   if(!Array.isArray(results)||results.length!==3||
      results.some(x=>x?.success!==true||x.meta?.changes!==1))deny();
   return Object.freeze({tenantId:q.tenantId,quotationId:q.quotationId,
    customerId:q.customerId,quotationSha256,termsSha256,
    acceptanceVersion:q.acceptanceVersion,totalMinor:q.totalMinor,
    state:"frozen-with-terms"});
  },
  loadFrozenCustomerQuote,
  async recordCustomerReviewOffered({
   sessionKeyHash,tenantId,customerId,quotationId,
   issuedAtMs,expiresAtMs,quotationSha256,termsSha256,
   acceptanceVersion,totalMinor
  }={}){
   if(!HASH(sessionKeyHash)||![tenantId,customerId,quotationId].every(ID)||
      !HASH(quotationSha256)||!HASH(termsSha256)||
      !Number.isSafeInteger(acceptanceVersion)||
      !Number.isSafeInteger(totalMinor)||totalMinor<0||
      !Number.isSafeInteger(issuedAtMs)||
      !Number.isSafeInteger(expiresAtMs))deny();
   const at=trustedClock(now);
   if(issuedAtMs>at||at-issuedAtMs>2000||
      expiresAtMs<=at||expiresAtMs-issuedAtMs>MAX_OFFER_MS)deny();
   const params={sessionKeyHash,tenantId,customerId,quotationId};
   const s=await currentSession(params,at);
   if(expiresAtMs>s.expiresAtMs)deny();
   const quote=await loadFrozenCustomerQuote(params);
   if(!quote||quote.quotationSha256!==quotationSha256||
      quote.termsSha256!==termsSha256||
      quote.acceptanceVersion!==acceptanceVersion||
      quote.totalMinor!==totalMinor)deny();
   let allowed=false;
   try{allowed=await authorizeCustomerReviewOffer({
    ...params,customerIdentityLinkId:s.customerIdentityLinkId,
    quotationSha256,termsSha256,acceptanceVersion,totalMinor
   })}catch{deny()}
   if(allowed!==true)deny();
   const presentationId=idFromRandom(randomBytes);
   let result;
   try{result=await db.prepare(ESSENTIALS_PRIVATE_INSERT_CUSTOMER_REVIEW_OFFER_SQL)
    .bind(presentationId,issuedAtMs,expiresAtMs,
     sessionKeyHash,tenantId,customerId,quotationId,expiresAtMs,
     quotationSha256,termsSha256,acceptanceVersion,totalMinor).run()}
   catch{deny()}
   if(result?.success!==true||result.meta?.changes!==1)deny();
   return Object.freeze({state:"offered",presentationId,
    sessionKeyHash,tenantId,customerId,quotationId,
    quotationSha256,termsSha256,acceptanceVersion,totalMinor,
    issuedAtMs,expiresAtMs});
  },
  async loadCustomerReviewOffered({
   presentationId,sessionKeyHash,tenantId,customerId,quotationId
  }={}){
   if(!ID(presentationId)||!HASH(sessionKeyHash)||
      ![tenantId,customerId,quotationId].every(ID))deny();
   const at=trustedClock(now);
   const params={sessionKeyHash,tenantId,customerId,quotationId};
   const s=await currentSession(params,at);
   let r;
   try{r=await db.prepare(ESSENTIALS_PRIVATE_READ_CUSTOMER_REVIEW_OFFER_SQL)
     .bind(presentationId,sessionKeyHash,tenantId,customerId,
      quotationId,at,at).first()}catch{deny()}
   if(!r)return null;
   if(r.state!=="offered"||r.presentation_id!==presentationId||
      r.session_key_sha256!==sessionKeyHash||
      r.tenant_id!==tenantId||r.customer_id!==customerId||
      r.quotation_id!==quotationId||
      r.customer_identity_link_id!==s.customerIdentityLinkId||
      !HASH(r.quotation_sha256)||!HASH(r.terms_sha256)||
      !Number.isSafeInteger(r.acceptance_version)||
      !Number.isSafeInteger(r.total_minor)||
      !Number.isSafeInteger(r.issued_at_ms)||
      !Number.isSafeInteger(r.expires_at_ms)||
      r.issued_at_ms>at||r.expires_at_ms<=at||
      r.expires_at_ms> s.expiresAtMs||
      r.expires_at_ms-r.issued_at_ms>MAX_OFFER_MS)deny();
   const quote=await loadFrozenCustomerQuote(params);
   if(!quote||quote.quotationSha256!==r.quotation_sha256||
      quote.termsSha256!==r.terms_sha256||
      quote.acceptanceVersion!==r.acceptance_version||
      quote.totalMinor!==r.total_minor)deny();
   return Object.freeze({
    state:"offered",presentationId,sessionKeyHash,tenantId,
    customerId,quotationId,quotationSha256:r.quotation_sha256,
    termsSha256:r.terms_sha256,acceptanceVersion:r.acceptance_version,
    totalMinor:r.total_minor,
    issuedAtMs:r.issued_at_ms,expiresAtMs:r.expires_at_ms
   });
  }
 });
}
