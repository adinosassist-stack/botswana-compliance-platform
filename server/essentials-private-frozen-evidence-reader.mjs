/**
 * UNMOUNTED source-only reader for a hypothetical APPROVED isolated
 * private-staging D1. Does not authenticate customer consent or prove the
 * provenance of a stored row. A separately approved customer identity/consent
 * capture service must own those guarantees. Never use production Finance.
 *
 * Both issuer callbacks re-read ONE joined frozen-quote/consent snapshot,
 * verify digest equality against the actual stored immutable BLOB bytes and
 * reject revoked/mismatched state. Commit still needs its independent atomic
 * INSERT ... SELECT guard against races between these reads and write.
 */
const id=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const hex=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
const reject=()=>{throw Error("private_frozen_evidence_unverified")};
const MAX_BLOB_BYTES=131072;

export const ESSENTIALS_PRIVATE_FROZEN_EVIDENCE_SQL=`
SELECT q.tenant_id AS tenant_id,q.quotation_id AS quotation_id,
 q.customer_id AS customer_id,q.quotation_reference AS quotation_reference,
 q.acceptance_version AS acceptance_version,q.total_minor AS total_minor,
 q.quotation_sha256 AS quotation_sha256,
 q.immutable_quotation_bytes AS quotation_bytes,
 c.consent_sha256 AS consent_sha256,
 c.immutable_consent_bytes AS consent_bytes,
 c.consent_subject_id AS consent_subject_id,
 c.actor_user_id AS actor_user_id,c.accepted_at AS accepted_at
FROM essentials_private_frozen_quotes AS q
JOIN essentials_private_verified_consents AS c
 ON c.tenant_id=q.tenant_id AND c.quotation_id=q.quotation_id
WHERE q.tenant_id=? AND q.quotation_id=? AND c.actor_user_id=?
 AND q.state='accepted' AND c.state='accepted'
 AND q.customer_id=c.customer_id
 AND q.quotation_reference=c.quotation_reference
 AND q.acceptance_version=c.acceptance_version
 AND q.total_minor=c.total_minor
 AND q.quotation_sha256=c.quotation_sha256
 AND length(c.consent_subject_id)>0
LIMIT 1
`.trim();

function bytes(value){
 let output;
 if(value instanceof Uint8Array)output=new Uint8Array(value);
 else if(value instanceof ArrayBuffer)output=new Uint8Array(value.slice(0));
 else if(Array.isArray(value)&&value.every(v=>Number.isInteger(v)&&v>=0&&v<=255))
  output=Uint8Array.from(value);
 else reject();
 if(output.byteLength<1||output.byteLength>MAX_BLOB_BYTES)reject();
 return output;
}
async function sha256(subtle,input){
 let digest;
 try{digest=await subtle.digest("SHA-256",input)}catch{reject()}
 const out=new Uint8Array(digest);
 if(out.length!==32)reject();
 return [...out].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
export function createEssentialsPrivateFrozenEvidenceReader({
 enabled=false,environment,db,cryptoSubtle=globalThis.crypto?.subtle
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_frozen_evidence_disabled");
 if(typeof db?.prepare!=="function"||typeof cryptoSubtle?.digest!=="function")
  throw Error("private_frozen_evidence_unconfigured");

 async function read({tenantId,quotationId,actorUserId}={}){
  if(!id(tenantId)||!id(quotationId)||!id(actorUserId))reject();
  let row;
  try{row=await db.prepare(ESSENTIALS_PRIVATE_FROZEN_EVIDENCE_SQL)
    .bind(tenantId,quotationId,actorUserId).first()}catch{reject()}
  if(!row)reject();
  if(row.tenant_id!==tenantId||row.quotation_id!==quotationId||
     row.actor_user_id!==actorUserId||
     !id(row.customer_id)||!id(row.quotation_reference)||
     !id(row.consent_subject_id)||
     !Number.isSafeInteger(row.acceptance_version)||
     row.acceptance_version<1||row.acceptance_version>2147483647||
     !Number.isSafeInteger(row.total_minor)||row.total_minor<0||
     !hex(row.quotation_sha256)||!hex(row.consent_sha256)||
     typeof row.accepted_at!=="string")reject();
  const quotationBytes=bytes(row.quotation_bytes);
  const consentBytes=bytes(row.consent_bytes);
  if(await sha256(cryptoSubtle,quotationBytes)!==row.quotation_sha256||
     await sha256(cryptoSubtle,consentBytes)!==row.consent_sha256)reject();
  return {tenantId,quotationId,actorUserId,customerId:row.customer_id,
   quotationReference:row.quotation_reference,
   acceptanceVersion:row.acceptance_version,totalMinor:row.total_minor,
   quotationSha256:row.quotation_sha256,consentSha256:row.consent_sha256,
   immutableQuotationBytes:quotationBytes,immutableConsentBytes:consentBytes,
   acceptedAt:row.accepted_at};
 }
 return Object.freeze({
  async loadFrozenAcceptedQuotation({tenantId,quotationId,actorUserId}={}){
   const r=await read({tenantId,quotationId,actorUserId});
   return Object.freeze({state:"accepted",tenantId,quotationId,
    customerId:r.customerId,quotationReference:r.quotationReference,
    acceptanceVersion:r.acceptanceVersion,totalMinor:r.totalMinor,
    immutableQuotationBytes:r.immutableQuotationBytes});
  },
  async verifyRecordedCustomerConsent({
   tenantId,quotationId,actorUserId,customerId,quotationReference,
   acceptanceVersion,totalMinor,quotationSha256
  }={}){
   if(!id(customerId)||!id(quotationReference)||
      !Number.isSafeInteger(acceptanceVersion)||!Number.isSafeInteger(totalMinor)||
      !hex(quotationSha256))reject();
   const r=await read({tenantId,quotationId,actorUserId});
   if(r.customerId!==customerId||r.quotationReference!==quotationReference||
      r.acceptanceVersion!==acceptanceVersion||r.totalMinor!==totalMinor||
      r.quotationSha256!==quotationSha256)reject();
   // "verified" here means database row/digest integrity ONLY.
   // It is NOT proof the actual customer authenticated or consented.
   return Object.freeze({verified:true,state:"accepted",
    tenantId,quotationId,actorUserId,customerId,quotationReference,
    acceptanceVersion,totalMinor,quotationSha256,
    acceptedAt:r.acceptedAt,immutableConsentBytes:r.immutableConsentBytes});
  }
 });
}
