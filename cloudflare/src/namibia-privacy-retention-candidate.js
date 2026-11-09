// Namibia privacy and retention REVIEW CANDIDATE ONLY.
// Not a statement of Namibian law. No live storage, deletion, or data transfers.
export const NAMIBIA_PRIVACY_CANDIDATE_VERSION="2026-11-07.v1";
export const DATA_CLASSES=Object.freeze({
 regulatory_source_metadata:Object.freeze({personalDataExpected:false,sensitivity:"low",rawDocuments:false}),
 company_evidence_metadata:Object.freeze({personalDataExpected:"possible",sensitivity:"review_required",rawDocuments:false}),
 beneficial_owner_identity:Object.freeze({personalDataExpected:true,sensitivity:"restricted",rawDocuments:true}),
 tax_documents:Object.freeze({personalDataExpected:true,sensitivity:"restricted",rawDocuments:true}),
 research_review_note:Object.freeze({personalDataExpected:"possible",sensitivity:"review_required",rawDocuments:false}),
 compliance_audit_event:Object.freeze({personalDataExpected:"possible",sensitivity:"review_required",rawDocuments:false})
});
const fail=error=>Object.freeze({ok:false,error});
const accepted=["access_review","erasure_review","retention_review","export_review"];
function clean(s,max){return typeof s==="string"&&s.trim()===s&&s.length>0&&s.length<=max?s:null}
export function classifyNamibiaCandidateRecord(record){
 if(!record||typeof record!=="object"||Array.isArray(record)||!Object.hasOwn(DATA_CLASSES,record.dataClass))
   return fail("unknown_data_class");
 const kind=DATA_CLASSES[record.dataClass];
 const storesRawDocument=record.storesRawDocument===true;
 if(storesRawDocument)return fail("raw_document_storage_not_authorized");
 if(record.crossBorderTransfer===true)return fail("cross_border_transfer_not_authorized");
 return Object.freeze({ok:true,value:Object.freeze({
   marketCode:"NA",dataClass:record.dataClass,sensitivity:kind.sensitivity,
   personalDataExpected:kind.personalDataExpected,storesRawDocument:false,
   retentionDays:null,retentionStatus:"unassessed",transferApproved:false,
   tenantIsolationReviewRequired:true,legalBasisReviewRequired:true
 })});
}
export function prepareNamibiaPrivacyRequest(input){
 if(!input||typeof input!=="object"||Array.isArray(input))return fail("invalid_privacy_request");
 const tenant=clean(input.tenantRef,120),requestId=clean(input.requestId,120);
 if(!tenant||!requestId||!accepted.includes(input.requestType))return fail("privacy_request_fields_required");
 if(input.retentionDays!==undefined||input.deleteNow===true||input.exportNow===true||input.approved===true)
   return fail("automatic_privacy_action_not_authorized");
 if(!Object.hasOwn(DATA_CLASSES,input.dataClass))return fail("unknown_data_class");
 return Object.freeze({ok:true,value:Object.freeze({
   marketCode:"NA",tenantRef:tenant,requestId,requestType:input.requestType,
   dataClass:input.dataClass,status:"needs_privacy_officer_review",
   retentionPeriodDays:null,retentionBasis:null,
   identityVerificationRequired:true,legalHoldCheckRequired:true,
   accessControlReviewRequired:true,securityReviewRequired:true,
   approved:false,autoDelete:false,autoExport:false,autoTransfer:false
 })});
}
export function namibiaPrivacyReadiness(requests){
 if(!Array.isArray(requests)||requests.length>1000)return fail("invalid_privacy_review_set");
 if(requests.some(r=>!r||r.marketCode!=="NA"||r.status!=="needs_privacy_officer_review"||
    r.approved!==false||r.autoDelete!==false||r.autoExport!==false||r.autoTransfer!==false))
   return fail("unreviewed_privacy_request_required");
 return Object.freeze({ok:true,ready:false,pending:requests.length,blockers:Object.freeze([
   "namibia_privacy_and_records_counsel_review",
   "lawful_basis_and_retention_schedule_unverified",
   "subject_identity_and_legal_hold_verification",
   "country_specific_cross_border_transfer_assessment",
   "controlled_erasure_and_immutable_audit_reconciliation_required"
 ])});
}
