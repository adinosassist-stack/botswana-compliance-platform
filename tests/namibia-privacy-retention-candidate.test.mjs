import assert from "node:assert/strict";
import test from "node:test";
import {classifyNamibiaCandidateRecord,prepareNamibiaPrivacyRequest,namibiaPrivacyReadiness,DATA_CLASSES}
 from "../cloudflare/src/namibia-privacy-retention-candidate.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";
test("candidate privacy classes never authorize raw documents or transfers",()=>{
 for(const dataClass of Object.keys(DATA_CLASSES)){
  const profile=classifyNamibiaCandidateRecord({dataClass});
  assert.equal(profile.ok,true);
  assert.equal(profile.value.retentionDays,null);
  assert.equal(profile.value.transferApproved,false);
  assert.equal(classifyNamibiaCandidateRecord({dataClass,storesRawDocument:true}).ok,false);
  assert.equal(classifyNamibiaCandidateRecord({dataClass,crossBorderTransfer:true}).ok,false);
 }
 assert.equal(classifyNamibiaCandidateRecord({dataClass:"unlisted"}).ok,false);
});
test("access and erasure requests require identity, legal hold and privacy review",()=>{
 for(const requestType of ["access_review","erasure_review","retention_review","export_review"]){
  const request=prepareNamibiaPrivacyRequest({
    tenantRef:"synthetic-tenant-A",requestId:"synthetic-request-1",requestType,dataClass:"company_evidence_metadata"
  });
  assert.equal(request.ok,true);
  assert.equal(request.value.identityVerificationRequired,true);
  assert.equal(request.value.legalHoldCheckRequired,true);
  assert.equal(request.value.autoDelete,false);
  assert.equal(request.value.autoExport,false);
  assert.equal(namibiaPrivacyReadiness([request.value]).ready,false);
 }
});
test("client-pushed retention, approval or immediate deletion fail closed",()=>{
 const base={tenantRef:"synthetic-tenant-A",requestId:"request-1",requestType:"erasure_review",dataClass:"compliance_audit_event"};
 for(const extra of [{retentionDays:30},{deleteNow:true},{exportNow:true},{approved:true}]){
  assert.equal(prepareNamibiaPrivacyRequest({...base,...extra}).ok,false);
 }
 assert.equal(prepareNamibiaPrivacyRequest({...base,requestType:"delete_immediately"}).ok,false);
 assert.equal(namibiaPrivacyReadiness([{marketCode:"NA",status:"needs_privacy_officer_review",approved:true}]).ok,false);
 assert.equal(marketActivationReadiness("NA").ready,false);
});
