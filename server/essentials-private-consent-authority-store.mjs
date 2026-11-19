/**
 * UNMOUNTED SOURCE-ONLY candidate for synthetic isolated Essentials staging D1.
 * NOT a consent authenticator. D1 row presence by itself does NOT prove a
 * real customer consented or that quote bytes were captured authoritatively.
 * A separately approved trusted capture service MUST populate immutable rows.
 * Do not bind to production Finance or activate a route.
 */
const id=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const hash=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const reject=()=>{throw Error("acceptance_authority_unverified")};

export const ESSENTIALS_PRIVATE_COMMIT_RECEIPT_SQL=`
INSERT INTO essentials_private_signed_receipts
 (tenant_id,quotation_id,receipt_id,actor_user_id,quotation_sha256,
  consent_sha256,receipt_payload_json,signature,issued_at,expires_at)
SELECT q.tenant_id,q.quotation_id,?,?,q.quotation_sha256,
       c.consent_sha256,?,?,?,?
FROM essentials_private_frozen_quotes AS q
JOIN essentials_private_verified_consents AS c
 ON c.tenant_id=q.tenant_id AND c.quotation_id=q.quotation_id
WHERE q.tenant_id=? AND q.quotation_id=?
 AND q.state='accepted' AND c.state='accepted'
 AND q.customer_id=? AND c.customer_id=q.customer_id
 AND q.quotation_reference=? AND c.quotation_reference=q.quotation_reference
 AND q.acceptance_version=? AND c.acceptance_version=q.acceptance_version
 AND q.total_minor=? AND c.total_minor=q.total_minor
 AND q.quotation_sha256=? AND c.quotation_sha256=q.quotation_sha256
 AND c.consent_sha256=? AND c.actor_user_id=?
 AND length(c.consent_subject_id)>0
 AND c.accepted_at=?
 AND EXISTS (
   SELECT 1
   FROM essentials_private_capture_attestations AS a
   JOIN essentials_private_one_time_challenges AS ch
     ON ch.challenge_id=a.challenge_id
      AND ch.tenant_id=a.tenant_id AND ch.quotation_id=a.quotation_id
   JOIN essentials_private_customer_identity_links AS link
     ON link.link_id=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.customerIdentityLinkId')
   WHERE a.tenant_id=q.tenant_id AND a.quotation_id=q.quotation_id
     AND a.customer_id=q.customer_id AND a.actor_user_id=c.actor_user_id
     AND a.consent_sha256=c.consent_sha256
     AND a.immutable_consent_bytes=c.immutable_consent_bytes
     AND a.consent_subject_id=c.consent_subject_id
     AND a.quotation_sha256=q.quotation_sha256
     AND a.accepted_at=c.accepted_at
     AND a.acceptance_version=q.acceptance_version
     AND a.total_minor=q.total_minor
     AND a.quotation_reference=q.quotation_reference
     AND ch.state='consumed' AND ch.consumed_at=a.accepted_at
     AND ch.customer_id=a.customer_id AND ch.actor_user_id=a.actor_user_id
     AND ch.nonce_sha256=a.nonce_sha256
     AND link.state='active' AND link.revoked_at_ms IS NULL
     AND link.tenant_id=q.tenant_id AND link.customer_id=q.customer_id
     AND link.consent_subject_id=c.consent_subject_id
     AND link.issuer=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.identityIssuer')
     AND link.subject_hmac_sha256=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.identitySubjectHmacSha256')
     AND link.consent_subject_id=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.consentSubjectId')
     AND a.challenge_id=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.challengeId')
     AND a.nonce_sha256=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.challengeNonceSha256')
     AND json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.method')='oidc-rs256-explicit-accept-v1'
     AND json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.decision')='accept'
     AND link.proof_verified_at_ms<=a.accepted_at_ms
     AND link.proof_verified_at_ms<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
     AND link.expires_at_ms>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 )
`.trim();

export const ESSENTIALS_PRIVATE_CURRENT_RECEIPT_SQL=`
SELECT r.receipt_id, r.receipt_payload_json,r.signature
FROM essentials_private_signed_receipts AS r
JOIN essentials_private_frozen_quotes AS q
 ON q.tenant_id=r.tenant_id AND q.quotation_id=r.quotation_id
JOIN essentials_private_verified_consents AS c
 ON c.tenant_id=r.tenant_id AND c.quotation_id=r.quotation_id
WHERE r.tenant_id=? AND r.quotation_id=? AND r.actor_user_id=?
 AND r.state='issued' AND q.state='accepted' AND c.state='accepted'
 AND q.customer_id=c.customer_id
 AND q.quotation_reference=c.quotation_reference
 AND q.acceptance_version=c.acceptance_version
 AND q.total_minor=c.total_minor
 AND q.quotation_sha256=c.quotation_sha256
 AND q.quotation_sha256=r.quotation_sha256
 AND c.consent_sha256=r.consent_sha256
 AND c.actor_user_id=r.actor_user_id
 AND length(c.consent_subject_id)>0
 AND json_extract(r.receipt_payload_json,'$.receiptId')=r.receipt_id
 AND json_extract(r.receipt_payload_json,'$.tenantId')=r.tenant_id
 AND json_extract(r.receipt_payload_json,'$.quotationId')=r.quotation_id
 AND json_extract(r.receipt_payload_json,'$.acceptedByUserId')=r.actor_user_id
 AND json_extract(r.receipt_payload_json,'$.customerId')=q.customer_id
 AND json_extract(r.receipt_payload_json,'$.quotationReference')=q.quotation_reference
 AND json_extract(r.receipt_payload_json,'$.acceptanceVersion')=q.acceptance_version
 AND json_extract(r.receipt_payload_json,'$.totalMinor')=q.total_minor
 AND json_extract(r.receipt_payload_json,'$.quotationSha256')=q.quotation_sha256
 AND json_extract(r.receipt_payload_json,'$.consentSha256')=c.consent_sha256
 AND json_extract(r.receipt_payload_json,'$.acceptedAt')=c.accepted_at
 AND EXISTS (
   SELECT 1
   FROM essentials_private_capture_attestations AS a
   JOIN essentials_private_one_time_challenges AS ch
     ON ch.challenge_id=a.challenge_id
      AND ch.tenant_id=a.tenant_id AND ch.quotation_id=a.quotation_id
   JOIN essentials_private_customer_identity_links AS link
     ON link.link_id=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.customerIdentityLinkId')
   WHERE a.tenant_id=q.tenant_id AND a.quotation_id=q.quotation_id
     AND a.customer_id=q.customer_id AND a.actor_user_id=c.actor_user_id
     AND a.consent_sha256=c.consent_sha256
     AND a.immutable_consent_bytes=c.immutable_consent_bytes
     AND a.consent_subject_id=c.consent_subject_id
     AND a.quotation_sha256=q.quotation_sha256
     AND a.accepted_at=c.accepted_at
     AND a.acceptance_version=q.acceptance_version
     AND a.total_minor=q.total_minor
     AND a.quotation_reference=q.quotation_reference
     AND ch.state='consumed' AND ch.consumed_at=a.accepted_at
     AND ch.customer_id=a.customer_id AND ch.actor_user_id=a.actor_user_id
     AND ch.nonce_sha256=a.nonce_sha256
     AND link.state='active' AND link.revoked_at_ms IS NULL
     AND link.tenant_id=q.tenant_id AND link.customer_id=q.customer_id
     AND link.consent_subject_id=c.consent_subject_id
     AND link.issuer=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.identityIssuer')
     AND link.subject_hmac_sha256=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.identitySubjectHmacSha256')
     AND link.consent_subject_id=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.consentSubjectId')
     AND a.challenge_id=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.challengeId')
     AND a.nonce_sha256=json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.challengeNonceSha256')
     AND json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.method')='oidc-rs256-explicit-accept-v1'
     AND json_extract((CASE WHEN json_valid(CAST(a.immutable_consent_bytes AS TEXT)) THEN CAST(a.immutable_consent_bytes AS TEXT) ELSE '{}' END),'$.decision')='accept'
     AND link.proof_verified_at_ms<=a.accepted_at_ms
     AND link.proof_verified_at_ms<=(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
     AND link.expires_at_ms>(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 )
 LIMIT 1
`.trim();

function validatedReceipt(input,tenantId,quotationId,actorUserId,expectedQuotationSha256,expectedConsentSha256){
 if(!input||typeof input!=="object"||Array.isArray(input)||
    !input.payload||typeof input.payload!=="object"||Array.isArray(input.payload)||
    typeof input.signature!=="string"||
    !/^[A-Za-z0-9_-]{86}$/.test(input.signature))reject();
 const p=input.payload;
 if(p.tenantId!==tenantId||p.quotationId!==quotationId||
    p.acceptedByUserId!==actorUserId||
    !id(p.receiptId)||!id(p.customerId)||!id(p.quotationReference)||
    p.quotationSha256!==expectedQuotationSha256||
    p.consentSha256!==expectedConsentSha256||
    !Number.isSafeInteger(p.acceptanceVersion)||p.acceptanceVersion<1||
    p.acceptanceVersion>2147483647||
    !Number.isSafeInteger(p.totalMinor)||p.totalMinor<0||
    p.issuer!=="thebe-private-quotation-consent-staging"||
    p.purpose!=="thebe.essentials.quotation-acceptance.v1")reject();
 for(const key of ["acceptedAt","issuedAt","expiresAt"]){
  const stamp=p[key];
  if(typeof stamp!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(stamp)||
     !Number.isFinite(Date.parse(stamp))||new Date(stamp).toISOString().replace(".000Z","Z")!==stamp)reject();
 }
 const start=Date.parse(p.issuedAt),end=Date.parse(p.expiresAt);
 if(Date.parse(p.acceptedAt)>start||end<=start||end-start>600000)reject();
 return p;
}
export function createEssentialsPrivateConsentAuthorityStore({
 enabled=false,environment,db
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("acceptance_authority_disabled");
 if(typeof db?.prepare!=="function")throw Error("acceptance_authority_unconfigured");
 return Object.freeze({
  async commitImmutableReceipt({
   tenantId,quotationId,actorUserId,receipt,
   expectedQuotationSha256,expectedConsentSha256
  }={}){
   if(!id(tenantId)||!id(quotationId)||!id(actorUserId)||
      !hash(expectedQuotationSha256)||!hash(expectedConsentSha256))reject();
   const p=validatedReceipt(receipt,tenantId,quotationId,actorUserId,
    expectedQuotationSha256,expectedConsentSha256);
   const payload=JSON.stringify(p);
   let result;
   try{
    result=await db.prepare(ESSENTIALS_PRIVATE_COMMIT_RECEIPT_SQL).bind(
     p.receiptId,actorUserId,payload,receipt.signature,p.issuedAt,p.expiresAt,
     tenantId,quotationId,p.customerId,p.quotationReference,p.acceptanceVersion,
     p.totalMinor,p.quotationSha256,p.consentSha256,actorUserId,p.acceptedAt
    ).run();
   }catch{reject()}
   if(result?.success!==true||result.meta?.changes!==1)reject();
   return true;
  },
  async loadServerSideReceipt({tenantId,quotationId,actorUserId}={}){
   if(!id(tenantId)||!id(quotationId)||!id(actorUserId))reject();
   let row;
   try{row=await db.prepare(ESSENTIALS_PRIVATE_CURRENT_RECEIPT_SQL)
    .bind(tenantId,quotationId,actorUserId).first()}catch{reject()}
   if(!row)return null;
   try{
    const payload=JSON.parse(row.receipt_payload_json);
    if(row.receipt_id!==payload.receiptId||
       !/^[A-Za-z0-9_-]{86}$/.test(row.signature))reject();
    return Object.freeze({payload,signature:row.signature});
   }catch{reject()}
  },
  async verifyCurrentAuthorityReceipt({
   tenantId,quotationId,actorUserId,receiptId,acceptanceVersion,customerId,
   quotationReference,totalMinor,quotationSha256,consentSha256
  }={}){
   if(!id(tenantId)||!id(quotationId)||!id(actorUserId)||
      !id(receiptId)||!id(customerId)||!id(quotationReference)||
      !hash(quotationSha256)||!hash(consentSha256)||
      !Number.isSafeInteger(acceptanceVersion)||
      !Number.isSafeInteger(totalMinor))return false;
   let row;
   try{row=await db.prepare(ESSENTIALS_PRIVATE_CURRENT_RECEIPT_SQL)
    .bind(tenantId,quotationId,actorUserId).first()}catch{return false}
   if(!row||row.receipt_id!==receiptId)return false;
   let p;
   try{p=JSON.parse(row.receipt_payload_json)}catch{return false}
   return p.acceptanceVersion===acceptanceVersion&&p.customerId===customerId&&
    p.quotationReference===quotationReference&&p.totalMinor===totalMinor&&
    p.quotationSha256===quotationSha256&&p.consentSha256===consentSha256;
  }
 });
}
