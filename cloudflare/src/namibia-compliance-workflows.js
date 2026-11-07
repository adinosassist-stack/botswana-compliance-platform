// Namibia preview-only workflows. No persistence, filing, or approval authority.
// Do not import this module into customer-facing runtime without separate authorization.
import { NAMIBIA_CANDIDATE } from "./namibia-compliance-candidate.js";

export const NAMIBIA_WORKFLOW_VERSION = "2026-11-07.v1";
const SOURCES = Object.freeze({
  annualDuty: "https://www.bipa.na/annual-duty/",
  beneficialOwnership: "https://www.bipa.na/beneficial-ownership/",
  vat: "https://itas.namra.org.na/taxes",
  aml: "https://www.fic.na/what-we_do/"
});
const ENTITIES = Object.freeze({
  company: Object.freeze({annualReturnForm:"CM23"}),
  close_corporation: Object.freeze({annualReturnForm:"CC7"}),
  section21_company: Object.freeze({annualReturnForm:"CM23"})
});
const EVIDENCE_TYPES = Object.freeze([
  "entity_registration", "financial_year_end", "annual_return_receipt",
  "annual_duty_receipt", "beneficial_owner_register", "bo_declaration",
  "bo_no_change_declaration", "bo_submission_receipt", "bo_change_history",
  "tax_registration", "turnover_assessment", "vat_return_receipt",
  "applicability_review", "professional_review"
]);
export const NAMIBIA_EVIDENCE_TYPES = EVIDENCE_TYPES;
function text(value, max=120) {return typeof value==="string" ? value.trim().slice(0,max) : "";}
function invalid(reason) {return Object.freeze({valid:false, reason});}
function valid(value) {return Object.freeze({valid:true,value});}
export function parseISODate(value) {
  if (typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date=new Date(value+"T00:00:00.000Z");
  return Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value ? null : value;
}
export function parseEntityProfile(input) {
  if (!input||typeof input!=="object"||Array.isArray(input))return invalid("entity_profile_required");
  if (!Object.hasOwn(ENTITIES,input.entityType))return invalid("unsupported_entity_type");
  const financialYearEnd=parseISODate(input.financialYearEnd);
  if (!financialYearEnd)return invalid("valid_financial_year_end_required");
  const entityRef=text(input.entityRef,64);
  if (!entityRef)return invalid("entity_reference_required");
  return valid(Object.freeze({marketCode:"NA",entityType:input.entityType,entityRef,financialYearEnd}));
}
function draft(type, title, sourceUrl, requiredEvidence, notes, fields={}) {
  return Object.freeze({
    marketCode:"NA",type,title,sourceUrl,
    status:"draft",regulatoryApproval:"pending",autoFile:false,autoNotify:false,
    deadlineConfirmed:false,requiredEvidence:Object.freeze([...requiredEvidence]),
    notes:Object.freeze([...notes]),...fields
  });
}
export function bipaAnnualReturnDraft(input) {
  const parsed=parseEntityProfile(input);
  if(!parsed.valid)return parsed;
  const p=parsed.value;
  return valid(draft("bipa_annual_return","BIPA annual return / duty review",SOURCES.annualDuty,
    ["entity_registration","financial_year_end","annual_return_receipt","annual_duty_receipt"],
    ["Verify applicability, annual duty, current fees and deadline with BIPA before filing.",
      "Financial year-end is contextual evidence; no automatic due date is implied."],
    {entity:p,form:ENTITIES[p.entityType].annualReturnForm,reviewDate:p.financialYearEnd}));
}
export function bipaBeneficialOwnershipDraft(input) {
  const parsed=parseEntityProfile(input);
  if(!parsed.valid)return parsed;
  if(!["changed","no_change","unknown"].includes(input.ownershipChange))return invalid("ownership_change_status_required");
  const mode=input.ownershipChange==="no_change"?"BO2":input.ownershipChange==="changed"?"BO1":"review";
  return valid(draft("bipa_beneficial_ownership","BIPA beneficial ownership filing review",SOURCES.beneficialOwnership,
    ["beneficial_owner_register","bo_submission_receipt",...(mode==="BO2"?["bo_no_change_declaration"]:["bo_declaration","bo_change_history"])],
    ["Verify whether the existing declaration qualifies for the no-change BO2 process.",
      "A material change can trigger a separate deadline; human review is required."],
    {entity:parsed.value,suggestedForm:mode,changeStatus:input.ownershipChange}));
}
export function namraVatAssessmentDraft(input) {
  const parsed=parseEntityProfile(input);
  if(!parsed.valid)return parsed;
  const turnover=input.annualTaxableTurnoverNAD;
  if(typeof turnover!=="number"||!Number.isFinite(turnover)||turnover<0)return invalid("valid_taxable_turnover_required");
  // The figures below are published by NamRA ITAS; applicability still requires review.
  const indicator=turnover>500000?"registration_review":turnover>200000?"voluntary_registration_review":"below_published_voluntary_range";
  return valid(draft("namra_vat_assessment","NamRA VAT registration review",SOURCES.vat,
    ["entity_registration","turnover_assessment","tax_registration"],
    ["Indicative only; confirm legal status, taxable supplies, exemptions and current thresholds with NamRA.",
     "Do not register, file a return, or calculate final liability automatically."],
    {entity:parsed.value,turnoverNAD:turnover,indicator,publishedThresholdsNAD:Object.freeze({mandatoryAbove:500000,voluntaryAbove:200000}),thresholdSourceReviewRequired:true}));
}
export function ficApplicabilityDraft(input) {
  const parsed=parseEntityProfile(input);
  if(!parsed.valid)return parsed;
  const activity=text(input.activityDescription,240);
  if(!activity)return invalid("activity_description_required");
  return valid(draft("fic_applicability","FIC regulated-activity applicability review","https://www.fic.na/",
    ["applicability_review","professional_review"],
    ["Applicable institutions and obligations depend on the actual activity and current legislation.",
     "No automatic accountable-institution classification or AML filing."],
    {entity:parsed.value,activityDescription:activity,applicability:"unassessed"}));
}
export function namibiaDraftQueue(profile, input={}) {
  const parsed=parseEntityProfile(profile);
  if(!parsed.valid)return parsed;
  const annual=bipaAnnualReturnDraft(profile);
  const bo=bipaBeneficialOwnershipDraft({...profile,ownershipChange:input.ownershipChange??"unknown"});
  const tasks=[annual.value,bo.value];
  if(input.annualTaxableTurnoverNAD!==undefined) {
    const vat=namraVatAssessmentDraft({...profile,annualTaxableTurnoverNAD:input.annualTaxableTurnoverNAD});
    if(!vat.valid)return vat;
    tasks.push(vat.value);
  }
  if(input.activityDescription)tasks.push(ficApplicabilityDraft({...profile,activityDescription:input.activityDescription}).value);
  return valid(Object.freeze({marketCode:"NA",productionEnabled:false,regulatoryPackStatus:NAMIBIA_CANDIDATE.status,
    tasks:Object.freeze(tasks),approvedTasks:0,automatedSubmissions:0}));
}
export function evidenceChecklist(task, provided=[]) {
  if(!task||task.marketCode!=="NA"||task.status!=="draft")return invalid("namibia_draft_task_required");
  if(!Array.isArray(provided)||provided.some(x=>typeof x!=="string"||!EVIDENCE_TYPES.includes(x)))return invalid("unknown_evidence_type");
  const unique=new Set(provided);
  const missing=task.requiredEvidence.filter(item=>!unique.has(item));
  return valid(Object.freeze({missing:Object.freeze(missing),received:Object.freeze([...unique]),readyToFile:false,
    needsHumanReview:true}));
}
export function reminderPreview(task, proposedDate) {
  if(!task||task.marketCode!=="NA"||task.status!=="draft")return invalid("namibia_draft_task_required");
  const date=parseISODate(proposedDate);
  if(!date)return invalid("valid_proposed_date_required");
  return valid(Object.freeze({marketCode:"NA",date,title:task.title,sourceUrl:task.sourceUrl,
    dueDateVerified:false,notificationEnabled:false,status:"draft",disclaimer:"Proposed planning date only. Confirm official deadline before notifying or filing."}));
}
export const NAMIBIA_PREVIEW_SOURCES = SOURCES;
