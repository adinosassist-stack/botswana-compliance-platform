import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEntityProfile,bipaAnnualReturnDraft,bipaBeneficialOwnershipDraft,
  namraVatAssessmentDraft,ficApplicabilityDraft,namibiaDraftQueue,
  evidenceChecklist,reminderPreview,NAMIBIA_EVIDENCE_TYPES
} from "../cloudflare/src/namibia-compliance-workflows.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";
import {regulatoryPackBundleForMarket} from "../cloudflare/src/regulatory-pack-registry.js";

const company={entityRef:"NA-TEST-01",entityType:"company",financialYearEnd:"2026-12-31"};
const cc={...company,entityType:"close_corporation"};
const section21={...company,entityType:"section21_company"};
test("entity profiles are validated and non-NA inputs cannot change the market",()=>{
  assert.equal(parseEntityProfile({...company,financialYearEnd:"2026-02-30"}).valid,false);
  assert.equal(parseEntityProfile({...company,entityType:"other"}).valid,false);
  assert.equal(parseEntityProfile({...company,entityRef:" "}).valid,false);
  assert.equal(parseEntityProfile({...company,marketCode:"BW"}).value.marketCode,"NA");
});
test("BIPA form selection is explicit and filing is never automated",()=>{
  for(const [entity,form] of [[company,"CM23"],[cc,"CC7"],[section21,"CM23"]]){
    const task=bipaAnnualReturnDraft(entity).value;
    assert.equal(task.form,form);
    assert.equal(task.autoFile,false);
    assert.equal(task.deadlineConfirmed,false);
  }
  assert.equal(bipaBeneficialOwnershipDraft({...company,ownershipChange:"changed"}).value.suggestedForm,"BO1");
  assert.equal(bipaBeneficialOwnershipDraft({...company,ownershipChange:"no_change"}).value.suggestedForm,"BO2");
  assert.equal(bipaBeneficialOwnershipDraft({...company,ownershipChange:"unknown"}).value.suggestedForm,"review");
  assert.equal(bipaBeneficialOwnershipDraft({...company,ownershipChange:"other"}).valid,false);
});
test("NamRA thresholds are indicative only and do not auto-register",()=>{
  const assess=n=>namraVatAssessmentDraft({...company,annualTaxableTurnoverNAD:n}).value;
  assert.equal(assess(500001).indicator,"registration_review");
  assert.equal(assess(500000).indicator,"voluntary_registration_review");
  assert.equal(assess(200001).indicator,"voluntary_registration_review");
  assert.equal(assess(200000).indicator,"below_published_voluntary_range");
  assert.equal(assess(0).autoFile,false);
  for(const invalid of [-1,NaN,Infinity,"600000",null])assert.equal(namraVatAssessmentDraft({...company,annualTaxableTurnoverNAD:invalid}).valid,false);
});
test("FIC assessments remain unclassified and all evidence is review-gated",()=>{
  const f=ficApplicabilityDraft({...company,activityDescription:"Business consultancy"}).value;
  assert.equal(f.applicability,"unassessed");
  assert.equal(f.autoNotify,false);
  const task=bipaBeneficialOwnershipDraft({...company,ownershipChange:"no_change"}).value;
  const checklist=evidenceChecklist(task,["beneficial_owner_register"]);
  assert.ok(checklist.value.missing.includes("bo_no_change_declaration"));
  assert.equal(checklist.value.readyToFile,false);
  assert.equal(evidenceChecklist(task,["passport"]).valid,false);
  assert.ok(NAMIBIA_EVIDENCE_TYPES.includes("bo_no_change_declaration"));
});
test("draft queue and reminders never activate Namibia",()=>{
  const queue=namibiaDraftQueue(company,{ownershipChange:"unknown",annualTaxableTurnoverNAD:520000,activityDescription:"Retail goods"}).value;
  assert.equal(queue.tasks.length,4);
  assert.equal(queue.productionEnabled,false);
  assert.equal(queue.approvedTasks,0);
  assert.equal(queue.automatedSubmissions,0);
  assert.ok(queue.tasks.every(t=>t.status==="draft"&&t.regulatoryApproval==="pending"));
  const reminder=reminderPreview(queue.tasks[0],"2027-01-15").value;
  assert.equal(reminder.dueDateVerified,false);
  assert.equal(reminder.notificationEnabled,false);
  assert.equal(reminderPreview(queue.tasks[0],"2027-02-29").valid,false);
  assert.equal(marketActivationReadiness("NA").ready,false);
  assert.equal(regulatoryPackBundleForMarket("NA"),null);
  assert.equal(marketActivationReadiness("BW").ready,true);
});
