/**
 * ONE CONSOLIDATED UNMOUNTED CUSTOMER CONSENT RELEASE CANDIDATE.
 * Distinct OUTSIDE CUSTOMER, never a Thebe employee actor.
 * Needs current customer-only HTTP/CSRF/terms boundary, independently verified
 * real customer IdP/account ownership, and isolated private-staging D1.
 * HMAC signature attests the SERVER record; it is NOT by itself a legal
 * customer signature or proof of real IdP/customer ownership.
 * No routes/Worker/D1 execution/Finance integration.
 */
const reject=()=>{throw Error("private_customer_final_consent_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const NOW_SQL="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const te=new TextEncoder();
const currentSource=[
 "EXISTS(SELECT 1 FROM essentials_private_customer_consent_sessions AS s",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=s.customer_identity_link_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=s.tenant_id AND q.quotation_id=s.quotation_id",
 "JOIN essentials_private_frozen_quote_terms AS t",
 " ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id",
 "JOIN essentials_private_frozen_quote_terms_audit AS f",
 " ON f.tenant_id=q.tenant_id AND f.quotation_id=q.quotation_id",
 "WHERE s.session_key_sha256=essentials_private_customer_quote_review_offers.session_key_sha256",
 "AND s.tenant_id=essentials_private_customer_quote_review_offers.tenant_id",
 "AND s.customer_id=essentials_private_customer_quote_review_offers.customer_id",
 "AND s.quotation_id=essentials_private_customer_quote_review_offers.quotation_id",
 "AND s.customer_identity_link_id=essentials_private_customer_quote_review_offers.customer_identity_link_id",
 "AND s.state='active' AND s.expires_at_ms>"+NOW_SQL,
 "AND l.state='active' AND l.expires_at_ms>"+NOW_SQL,
 "AND l.tenant_id=s.tenant_id AND l.customer_id=s.customer_id",
 "AND l.subject_hmac_sha256=s.identity_subject_hmac_sha256",
 "AND l.consent_subject_id=s.consent_subject_id",
 "AND q.state='accepted' AND q.customer_id=s.customer_id",
 "AND q.quotation_sha256=essentials_private_customer_quote_review_offers.quotation_sha256",
 "AND q.acceptance_version=essentials_private_customer_quote_review_offers.acceptance_version",
 "AND q.total_minor=essentials_private_customer_quote_review_offers.total_minor",
 "AND t.terms_sha256=essentials_private_customer_quote_review_offers.terms_sha256",
 "AND t.customer_id=q.customer_id AND t.quotation_reference=q.quotation_reference",
 "AND t.acceptance_version=q.acceptance_version AND t.total_minor=q.total_minor",
 "AND t.quotation_sha256=q.quotation_sha256 AND t.frozen_at=q.frozen_at",
 "AND f.terms_sha256=t.terms_sha256 AND f.quotation_sha256=q.quotation_sha256",
 "AND f.frozen_at=q.frozen_at)",
].join(" ");
export const ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_REVIEW_SQL=[
 "UPDATE essentials_private_customer_quote_review_offers",
 "SET state='consumed',used_at_ms=?",
 "WHERE presentation_id=? AND session_key_sha256=?",
 "AND tenant_id=? AND customer_id=? AND quotation_id=?",
 "AND quotation_sha256=? AND terms_sha256=?",
 "AND acceptance_version=? AND total_minor=?",
 "AND state='offered' AND issued_at_ms<=? AND expires_at_ms>?",
 "AND issued_at_ms<="+NOW_SQL+" AND expires_at_ms>"+NOW_SQL,
 "AND "+currentSource,
 "AND NOT EXISTS (SELECT 1 FROM essentials_private_customer_verified_acceptances AS a",
 " WHERE a.tenant_id=essentials_private_customer_quote_review_offers.tenant_id",
 " AND a.quotation_id=essentials_private_customer_quote_review_offers.quotation_id)"
].join(" ");
export const ESSENTIALS_PRIVATE_INSERT_CUSTOMER_ACCEPTANCE_SQL=[
 "INSERT INTO essentials_private_customer_verified_acceptances",
 "(tenant_id,quotation_id,customer_id,presentation_id,session_key_sha256,",
 "customer_identity_link_id,identity_issuer,consent_subject_id,",
 "identity_subject_hmac_sha256,quotation_sha256,terms_sha256,",
 "acceptance_version,total_minor,authentication_proof_sha256,",
 "acceptance_sha256,immutable_acceptance_bytes,server_hmac_sha256,accepted_at_ms)",
 "SELECT o.tenant_id,o.quotation_id,o.customer_id,o.presentation_id,",
 "o.session_key_sha256,o.customer_identity_link_id,l.issuer,",
 "s.consent_subject_id,s.identity_subject_hmac_sha256,",
 "o.quotation_sha256,o.terms_sha256,o.acceptance_version,o.total_minor,",
 "?,?,?,?,?",
 "FROM essentials_private_customer_quote_review_offers AS o",
 "JOIN essentials_private_customer_consent_sessions AS s",
 " ON s.session_key_sha256=o.session_key_sha256",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=o.customer_identity_link_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=o.tenant_id AND q.quotation_id=o.quotation_id",
 "JOIN essentials_private_frozen_quote_terms AS t",
 " ON t.tenant_id=o.tenant_id AND t.quotation_id=o.quotation_id",
 "JOIN essentials_private_frozen_quote_terms_audit AS f",
 " ON f.tenant_id=o.tenant_id AND f.quotation_id=o.quotation_id",
 "WHERE o.presentation_id=? AND o.session_key_sha256=?",
 "AND o.tenant_id=? AND o.customer_id=? AND o.quotation_id=?",
 "AND o.customer_identity_link_id=?",
 "AND o.quotation_sha256=? AND o.terms_sha256=?",
 "AND o.acceptance_version=? AND o.total_minor=?",
 "AND o.state='consumed' AND o.used_at_ms=?",
 "AND o.issued_at_ms<=? AND o.expires_at_ms>=?",
 "AND s.state='active' AND s.tenant_id=o.tenant_id",
 "AND s.customer_id=o.customer_id AND s.quotation_id=o.quotation_id",
 "AND s.customer_identity_link_id=o.customer_identity_link_id",
 "AND s.consent_subject_id=? AND s.identity_subject_hmac_sha256=?",
 "AND s.expires_at_ms>"+NOW_SQL+" AND s.expires_at_ms>=?",
 "AND l.state='active' AND l.tenant_id=o.tenant_id",
 "AND l.customer_id=o.customer_id AND l.issuer=?",
 "AND l.consent_subject_id=s.consent_subject_id",
 "AND l.subject_hmac_sha256=s.identity_subject_hmac_sha256",
 "AND l.expires_at_ms>"+NOW_SQL+" AND l.expires_at_ms>=?",
 "AND q.state='accepted' AND q.customer_id=o.customer_id",
 "AND q.quotation_sha256=o.quotation_sha256",
 "AND q.acceptance_version=o.acceptance_version AND q.total_minor=o.total_minor",
 "AND t.customer_id=q.customer_id AND t.quotation_sha256=q.quotation_sha256",
 "AND t.terms_sha256=o.terms_sha256 AND t.quotation_reference=q.quotation_reference",
 "AND t.acceptance_version=q.acceptance_version AND t.total_minor=q.total_minor",
 "AND t.frozen_at=q.frozen_at",
 "AND f.quotation_sha256=q.quotation_sha256",
 "AND f.terms_sha256=t.terms_sha256 AND f.frozen_at=q.frozen_at"
].join(" ");
export const ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_ACCEPTANCE_SQL=[
 "INSERT INTO essentials_private_customer_acceptance_audit",
 "(tenant_id,quotation_id,presentation_id,session_key_sha256,",
 "acceptance_sha256,committed_at_ms) VALUES(?,?,?,?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_READ_CUSTOMER_ACCEPTANCE_SQL=[
 "SELECT tenant_id,quotation_id,customer_id,presentation_id,",
 "session_key_sha256,customer_identity_link_id,identity_issuer,",
 "consent_subject_id,identity_subject_hmac_sha256,quotation_sha256,",
 "terms_sha256,acceptance_version,total_minor,authentication_proof_sha256,",
 "acceptance_sha256,immutable_acceptance_bytes,server_hmac_sha256,",
 "accepted_at_ms,state",
 "FROM essentials_private_customer_verified_acceptances",
 "WHERE tenant_id=? AND quotation_id=?"
].join(" ");
async function sha(subtle,v){
 let h;try{h=new Uint8Array(await subtle.digest("SHA-256",v))}catch{reject()}
 if(h.length!==32)reject();
 return [...h].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function hex(v){
 return [...new Uint8Array(v)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function bytes(v){
 if(v instanceof Uint8Array)return new Uint8Array(v);
 if(v instanceof ArrayBuffer)return new Uint8Array(v);
 if(Array.isArray(v)&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255))return Uint8Array.from(v);
 reject();
}
function atMs(now){
 let n;try{n=now()}catch{reject()}
 if(!Number.isSafeInteger(n)||n<=0)reject();
 return n;
}
function checkContext(c){
 if(c?.role!=="customer"||c.decision!=="accept"||c.explicitlyAccepted!==true||
   ![c.tenantId,c.customerId,c.quotationId,c.customerIdentityLinkId,
     c.presentationId].every(ID)||
   !HASH(c.sessionKeyHash)||!HASH(c.confirmedQuoteSha256)||
   !HASH(c.confirmedTermsSha256)||!Number.isSafeInteger(c.confirmedTotalMinor)||
   c.confirmedTotalMinor<0||
   !Number.isSafeInteger(c.confirmedAcceptanceVersion)||
   c.confirmedAcceptanceVersion<1)reject();
}
function validProof(p,c,at){
 return p?.verified===true&&
  p.tenantId===c.tenantId&&p.customerId===c.customerId&&
  p.quotationId===c.quotationId&&
  p.customerIdentityLinkId===c.customerIdentityLinkId&&
  ID(p.consentSubjectId)&&
  HASH(p.identitySubjectHmacSha256)&&
  HASH(p.authenticationProofSha256)&&
  typeof p.issuer==="string"&&
  /^https:\/\/[^?#\s]+$/.test(p.issuer)&&p.issuer.length<=250&&
  Number.isSafeInteger(p.authenticatedAtMs)&&
  p.authenticatedAtMs>0&&p.authenticatedAtMs<=at&&
  at-p.authenticatedAtMs<=300000;
}
function createEvidence(c,p,at){
 return Object.freeze({
  schema:"thebe-private-customer-acceptance-v1",
  role:"customer",tenantId:c.tenantId,quotationId:c.quotationId,
  customerId:c.customerId,presentationId:c.presentationId,
  sessionKeySha256:c.sessionKeyHash,
  customerIdentityLinkId:c.customerIdentityLinkId,
  identityIssuer:p.issuer,consentSubjectId:p.consentSubjectId,
  identitySubjectHmacSha256:p.identitySubjectHmacSha256,
  authenticationProofSha256:p.authenticationProofSha256,
  quotationSha256:c.confirmedQuoteSha256,
  termsSha256:c.confirmedTermsSha256,
  acceptanceVersion:c.confirmedAcceptanceVersion,
  totalMinor:c.confirmedTotalMinor,
  decision:"accept",explicitlyAccepted:true,acceptedAtMs:at
 });
}
export function createEssentialsPrivateConsolidatedCustomerConsent({
 enabled=false,environment,db,hmacKey,cryptoSubtle=globalThis.crypto?.subtle,
 now=()=>Date.now(),validateExplicitCustomerAcceptance,
 verifyCurrentCustomerIdentityProof,authorizeCustomerConsentCommit
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_customer_final_consent_disabled");
 if(typeof db?.prepare!=="function"||typeof db?.batch!=="function"||
   hmacKey?.type!=="secret"||hmacKey?.extractable!==false||
   hmacKey?.algorithm?.name!=="HMAC"||
   hmacKey?.algorithm?.hash?.name!=="SHA-256"||
   hmacKey?.algorithm?.length<256||
   !hmacKey.usages?.includes("sign")||!hmacKey.usages?.includes("verify")||
   typeof cryptoSubtle?.digest!=="function"||
   typeof cryptoSubtle?.sign!=="function"||
   typeof cryptoSubtle?.verify!=="function"||
   [now,validateExplicitCustomerAcceptance,
    verifyCurrentCustomerIdentityProof,
    authorizeCustomerConsentCommit].some(x=>typeof x!=="function"))
  throw Error("private_customer_final_consent_unconfigured");
 return Object.freeze({
  // The host MUST inject the genuine #2710 customer-only origin/CSRF/offer
  // validation service, not a browser-supplied "validated" object.
  async commitExplicitCustomerAcceptance({request,quotationId}={}){
   if(!ID(quotationId)||request?.method!=="POST")reject();
   const at=atMs(now);
   let context;
   try{context=await validateExplicitCustomerAcceptance({request,quotationId})}
   catch{reject()}
   checkContext(context);
   if(context.quotationId!==quotationId)reject();
   let proof;
   try{proof=await verifyCurrentCustomerIdentityProof({context,at})}
   catch{reject()}
   if(!validProof(proof,context,at))reject();
   let approved=false;
   try{approved=await authorizeCustomerConsentCommit({context,proof,at})}
   catch{reject()}
   if(approved!==true)reject();
   const evidence=createEvidence(context,proof,at);
   const canonical=te.encode(JSON.stringify(evidence));
   if(canonical.length<100||canonical.length>8192)reject();
   const consentSha=await sha(cryptoSubtle,canonical);
   let signature;
   try{signature=hex(await cryptoSubtle.sign("HMAC",hmacKey,canonical))}
   catch{reject()}
   if(!HASH(signature))reject();
   const c=context,p=proof;
   let results;
   try{
    results=await db.batch([
     db.prepare(ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_REVIEW_SQL).bind(
      at,c.presentationId,c.sessionKeyHash,c.tenantId,c.customerId,
      c.quotationId,c.confirmedQuoteSha256,c.confirmedTermsSha256,
      c.confirmedAcceptanceVersion,c.confirmedTotalMinor,at,at
     ),
     db.prepare(ESSENTIALS_PRIVATE_INSERT_CUSTOMER_ACCEPTANCE_SQL).bind(
      p.authenticationProofSha256,consentSha,Array.from(canonical),signature,at,
      c.presentationId,c.sessionKeyHash,c.tenantId,c.customerId,c.quotationId,
      c.customerIdentityLinkId,c.confirmedQuoteSha256,c.confirmedTermsSha256,
      c.confirmedAcceptanceVersion,c.confirmedTotalMinor,at,at,at,
      p.consentSubjectId,p.identitySubjectHmacSha256,at,
      p.issuer,at
     ),
     db.prepare(ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_ACCEPTANCE_SQL).bind(
      c.tenantId,c.quotationId,c.presentationId,c.sessionKeyHash,consentSha,at
     )
    ]);
   }catch{reject()}
   if(!Array.isArray(results)||results.length!==3||
     results.some(r=>r?.success!==true||r.meta?.changes!==1))reject();
   // SERVER signature authenticates provenance/integrity of evidence only.
   return Object.freeze({
    state:"recorded",tenantId:c.tenantId,quotationId:c.quotationId,
    customerId:c.customerId,acceptedAtMs:at,
    acceptanceSha256:consentSha,serverHmacSha256:signature
   });
  },
  async verifyRecordedCustomerAcceptance({tenantId,quotationId}={}){
   if(!ID(tenantId)||!ID(quotationId))reject();
   let row;
   try{row=await db.prepare(ESSENTIALS_PRIVATE_READ_CUSTOMER_ACCEPTANCE_SQL)
    .bind(tenantId,quotationId).first()}catch{reject()}
   if(!row)return null;
   if(row.tenant_id!==tenantId||row.quotation_id!==quotationId||
      ![row.customer_id,row.presentation_id,row.customer_identity_link_id,
        row.consent_subject_id].every(ID)||
      !HASH(row.acceptance_sha256)||!HASH(row.server_hmac_sha256))reject();
   const data=bytes(row.immutable_acceptance_bytes);
   if(data.length<100||data.length>8192)reject();
   if(await sha(cryptoSubtle,data)!==row.acceptance_sha256)reject();
   let valid=false;
   try{valid=await cryptoSubtle.verify("HMAC",hmacKey,
    Uint8Array.from(row.server_hmac_sha256.match(/../g),x=>parseInt(x,16)),
    data)}catch{reject()}
   if(valid!==true)reject();
   let p;
   try{p=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data))}
   catch{reject()}
   if(!p||typeof p!=="object"||Array.isArray(p)||
      p.schema!=="thebe-private-customer-acceptance-v1"||
      p.role!=="customer"||p.decision!=="accept"||
      p.explicitlyAccepted!==true||p.tenantId!==tenantId||
      p.quotationId!==quotationId||p.customerId!==row.customer_id||
      p.presentationId!==row.presentation_id||
      p.sessionKeySha256!==row.session_key_sha256||
      p.customerIdentityLinkId!==row.customer_identity_link_id||
      p.identityIssuer!==row.identity_issuer||
      p.consentSubjectId!==row.consent_subject_id||
      p.identitySubjectHmacSha256!==row.identity_subject_hmac_sha256||
      p.quotationSha256!==row.quotation_sha256||
      p.termsSha256!==row.terms_sha256||
      p.acceptanceVersion!==row.acceptance_version||
      p.totalMinor!==row.total_minor||
      p.authenticationProofSha256!==row.authentication_proof_sha256||
      p.acceptedAtMs!==row.accepted_at_ms||
      JSON.stringify(p)!==new TextDecoder().decode(data))reject();
   return Object.freeze({state:row.state,tenantId,quotationId,
    customerId:row.customer_id,acceptedAtMs:row.accepted_at_ms,
    acceptanceSha256:row.acceptance_sha256,
    serverHmacSha256:row.server_hmac_sha256});
  }
 });
}
