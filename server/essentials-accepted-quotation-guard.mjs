/**
 * UNMOUNTED candidate, isolated Essentials staging only.
 * Single guarded INSERT checks accepted state at the SAME D1 write boundary.
 * Host MUST independently authenticate principal/session/CSRF, verify signed
 * acceptance event origin, and supply trusted draft and invoice identifiers.
 * This does not populate acceptance snapshots or deploy anything.
 */
const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
export const ACCEPTED_QUOTATION_GUARDED_DRAFT_INSERT_SQL = `
INSERT INTO essentials_invoice_drafts
 (id,tenant_id,customer_id,source_quotation_id,idempotency_key,invoice_number,
  draft_payload_json,status,created_by_user_id)
SELECT ?,a.tenant_id,a.customer_id,a.quotation_id,?, ?,?,'draft',?
FROM essentials_accepted_quotation_snapshots AS a
WHERE a.tenant_id=? AND a.quotation_id=? AND a.customer_id=?
 AND a.quotation_reference=? AND a.acceptance_version=?
 AND a.total_minor=? AND a.state='accepted'
 AND json_valid(?) AND json_extract(?, '$.tenantId')=a.tenant_id
 AND json_extract(?, '$.customerId')=a.customer_id
 AND json_extract(?, '$.sourceQuotationReference')=a.quotation_reference
 AND json_extract(?, '$.totalMinor')=a.total_minor
 AND json_extract(?, '$.status')='draft'
 AND json_extract(?, '$.invoiceReference')=?
 AND json_extract(?, '$.currency')='BWP'
`.trim();

export async function insertAcceptedEssentialsDraftGuarded({
 db,principal,record,acceptanceVersion,sourceQuotationReference
}={}){
 if(typeof db?.prepare!=="function")throw TypeError("d1_required");
 if(!principal||!valid(principal.tenantId)||!valid(principal.userId)||
    !Array.isArray(principal.permissions)||
    !principal.permissions.includes("invoice:draft:create"))
  throw Error("permission_denied");
 if(!record||["id","tenantId","customerId","sourceQuotationId","idempotencyKey",
 "invoiceNumber","createdByUserId"].some(k=>!valid(record[k]))||
 record.tenantId!==principal.tenantId||record.createdByUserId!==principal.userId||
 !valid(sourceQuotationReference)||!Number.isSafeInteger(acceptanceVersion)||
 acceptanceVersion<1||acceptanceVersion>2147483647)
  throw Error("invalid_acceptance_record");
 const draft=record.draft;
 if(!draft||draft.tenantId!==record.tenantId||draft.customerId!==record.customerId||
    draft.status!=="draft"||draft.invoiceReference!==record.invoiceNumber||
    draft.sourceQuotationReference!==sourceQuotationReference||
    !Number.isSafeInteger(draft.totalMinor)||draft.totalMinor<0)
  throw Error("invalid_draft");
 const payload=JSON.stringify(draft);
 if(payload.length>65536)throw Error("payload_too_large");
 // One atomic INSERT SELECT; zero rows means source was stale, revoked,
 // cross-tenant or not accepted. No read-before-insert eligibility race.
 const result=await db.prepare(ACCEPTED_QUOTATION_GUARDED_DRAFT_INSERT_SQL).bind(
  record.id,record.idempotencyKey,record.invoiceNumber,payload,record.createdByUserId,
  record.tenantId,record.sourceQuotationId,record.customerId,
  sourceQuotationReference,acceptanceVersion,draft.totalMinor,
  payload,payload,payload,payload,payload,payload,
  payload,record.invoiceNumber,payload
 ).run();
 if(result?.success!==true||result.meta?.changes!==1)
  throw Error("acceptance_stale_or_unverified");
 return Object.freeze({id:record.id,tenantId:record.tenantId,
  sourceQuotationId:record.sourceQuotationId,invoiceReference:record.invoiceNumber,
  status:"draft"});
}
