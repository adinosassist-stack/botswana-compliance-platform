/**
 * C4 read-only approved business quotation source from *isolated* quotation D1.
 *
 * Source-only, not a customer endpoint or actual business authority.
 * The staging approval registry migration is review-only and NOT applied.
 * Real cross-service owner approval/Finance customer authority must be
 * independently verified; do not treat local D1 row as production evidence.
 */
const NAME="bw-quotation-staging";
const UUID="aec227e9-b0f2-4b00-8de0-105465c4e2d6";
const DENY=()=>{throw Error("c4_approved_quotation_source_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HEX=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const QMAX=131072,TMAX=65536;
export const C4_READ_APPROVED_STAGING_QUOTATION_SQL=[
 "SELECT p.tenant_id,p.quotation_id,p.customer_id,p.quotation_reference,",
 "p.approval_evidence_id,p.approved_by_actor_user_id,p.acceptance_version,",
 "p.total_minor,p.currency,p.quotation_sha256,p.terms_sha256,",
 "p.immutable_quotation_bytes,p.immutable_terms_bytes,p.approved_at_ms",
 "FROM c4_quotation_approved_publications AS p",
 "JOIN c4_quotation_approval_assertions AS a",
 " ON a.tenant_id=p.tenant_id AND a.quotation_id=p.quotation_id",
 " AND a.customer_id=p.customer_id",
 " AND a.approval_evidence_id=p.approval_evidence_id",
 " AND a.quotation_sha256=p.quotation_sha256",
 " AND a.terms_sha256=p.terms_sha256",
 " AND a.approved_at_ms=p.approved_at_ms",
 "LEFT JOIN c4_quotation_approval_revocations AS r",
 " ON r.tenant_id=p.tenant_id AND r.quotation_id=p.quotation_id",
 "WHERE p.tenant_id=? AND p.customer_id=? AND p.quotation_id=?",
 " AND p.state='approved-for-issuance' AND p.currency='BWP'",
 " AND r.tenant_id IS NULL LIMIT 1"
].join(" ");
function readBytes(v,max){
 let bytes;
 if(v instanceof Uint8Array)bytes=new Uint8Array(v);
 else if(v instanceof ArrayBuffer)bytes=new Uint8Array(v.slice(0));
 else if(Array.isArray(v)&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255))
  bytes=Uint8Array.from(v);
 else DENY();
 if(bytes.length<1||bytes.length>max)DENY();
 return bytes;
}
async function digest(subtle,value){
 let b;try{b=new Uint8Array(await subtle.digest("SHA-256",value))}catch{DENY()}
 if(b.length!==32)DENY();
 return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
}
export const C4_APPROVED_QUOTATION_SOURCE_CONTRACT=Object.freeze({
 databaseName:NAME,databaseId:UUID,
 privateOnly:true,productionDbBound:false,
 registryMigrationApplied:false,
 independentlyApprovedBusinessSourceConnected:false,
 customerLoginEnabled:false,cloudWriteAuthorized:false
});
export function createC4ApprovedQuotationStagingReadAdapter({
 enabled=false,environment,db,verifyBoundQuotationDb,
 verifyIndependentBusinessApproval,cryptoSubtle=globalThis.crypto?.subtle
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("c4_approved_quotation_source_disabled");
 if(typeof db?.prepare!=="function"||
    typeof verifyBoundQuotationDb!=="function"||
    typeof verifyIndependentBusinessApproval!=="function"||
    typeof cryptoSubtle?.digest!=="function")
  throw Error("c4_approved_quotation_source_unconfigured");
 return Object.freeze({
  async loadApprovedBusinessQuotation({tenantId,customerId,quotationId}={}){
   if(![tenantId,customerId,quotationId].every(ID))DENY();
   let confirmed=false;
   try{confirmed=await verifyBoundQuotationDb({
    db,accountResource:"D1",name:NAME,id:UUID,
    expectedEnvironment:"essentials-private-staging"
   })}catch{DENY()}
   if(confirmed!==true)DENY();
   let row;
   try{row=await db.prepare(C4_READ_APPROVED_STAGING_QUOTATION_SQL)
    .bind(tenantId,customerId,quotationId).first()}catch{DENY()}
   if(!row)return null;
   if(row.tenant_id!==tenantId||row.customer_id!==customerId||
      row.quotation_id!==quotationId||!ID(row.quotation_reference)||
      !ID(row.approval_evidence_id)||!ID(row.approved_by_actor_user_id)||
      !Number.isSafeInteger(row.acceptance_version)||
      row.acceptance_version<1||row.acceptance_version>2147483647||
      !Number.isSafeInteger(row.total_minor)||row.total_minor<0||
      !Number.isSafeInteger(row.approved_at_ms)||row.approved_at_ms<=0||
      row.currency!=="BWP"||
      !HEX(row.quotation_sha256)||!HEX(row.terms_sha256))DENY();
   const quoteBytes=readBytes(row.immutable_quotation_bytes,QMAX);
   const termsBytes=readBytes(row.immutable_terms_bytes,TMAX);
   const [qhash,thash]=await Promise.all([
    digest(cryptoSubtle,quoteBytes),digest(cryptoSubtle,termsBytes)
   ]);
   if(row.quotation_sha256!==qhash||row.terms_sha256!==thash)DENY();
   let accepted=false;
   try{accepted=await verifyIndependentBusinessApproval({
    tenantId,customerId,quotationId,
    quotationReference:row.quotation_reference,
    approvalEvidenceId:row.approval_evidence_id,
    approvedByActorUserId:row.approved_by_actor_user_id,
    approvalTimestampMs:row.approved_at_ms,
    acceptanceVersion:row.acceptance_version,
    totalMinor:row.total_minor,currency:"BWP",
    quotationSha256:qhash,termsSha256:thash
   })}catch{DENY()}
   if(accepted!==true)DENY();
   return Object.freeze({
    tenantId,customerId,quotationId,
    quotationReference:row.quotation_reference,
    approvalEvidenceId:row.approval_evidence_id,
    acceptanceVersion:row.acceptance_version,
    totalMinor:row.total_minor,
    quotationSha256:qhash,termsSha256:thash,
    immutableQuotationBytes:quoteBytes,
    immutableTermsBytes:termsBytes,
    state:"approved-for-issuance",
    current:true,revoked:false,sourceVerified:true,
    completeApprovedTerms:true
   });
  }
 });
}
