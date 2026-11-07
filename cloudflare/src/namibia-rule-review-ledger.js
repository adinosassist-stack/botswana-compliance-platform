// Offline Namibia regulatory review ledger candidate. Not registered with runtime or migrations.
// Immutable versioned proposals: source evidence is not an approved rule or legal opinion.
import {prepareNamibiaSourceSnapshotCandidate} from "./namibia-source-review-candidate.js";
import {parseISODate} from "./namibia-compliance-workflows.js";

export const NAMIBIA_RULE_REVIEW_VERSION="2026-11-07.v1";
const TASK_TYPES=Object.freeze(["bipa_annual_return","bipa_beneficial_ownership","namra_vat_assessment","fic_applicability"]);
const fail=reason=>Object.freeze({ok:false,error:reason});
const ok=value=>Object.freeze({ok:true,value:Object.freeze(value)});
const trim=(v,max)=>typeof v==="string"&&v.trim()===v&&v.length>0&&v.length<=max?v:null;
const isHash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const fields=["sourceId","authority","title","url","capturedAt","contentSha256"];
export function draftNamibiaRuleRevision(input){
 if(!input||typeof input!=="object"||Array.isArray(input))return fail("invalid_rule_revision");
 const version=input.revision;
 if(!Number.isSafeInteger(version)||version<1||version>99999)return fail("invalid_revision");
 const key=trim(input.ruleKey,85);
 if(!key||!/^na_(?:bipa|namra|fic)_[a-z0-9_]+$/.test(key))return fail("invalid_rule_key");
 if(!TASK_TYPES.includes(input.taskType))return fail("unknown_task_type");
 const expected={bipa_annual_return:"bipa",bipa_beneficial_ownership:"bipa",namra_vat_assessment:"namra",fic_applicability:"fic"}[input.taskType];
 if(!key.startsWith("na_"+expected+"_"))return fail("authority_task_mismatch");
 const sourceInput=Object.fromEntries(fields.map(k=>[k,input.source?.[k]]));
 const snapshot=prepareNamibiaSourceSnapshotCandidate(sourceInput);
 if(!snapshot.ok)return fail("source_"+snapshot.error);
 if(snapshot.value.authority!==expected)return fail("rule_source_authority_mismatch");
 const title=trim(input.title,160),description=trim(input.reviewQuestion,1000);
 if(!title||!description)return fail("rule_description_required");
 if(input.legalEffectiveFrom!==null&&input.legalEffectiveFrom!==undefined&&!parseISODate(input.legalEffectiveFrom))return fail("invalid_effective_from");
 if(input.legalEffectiveTo!==null&&input.legalEffectiveTo!==undefined&&!parseISODate(input.legalEffectiveTo))return fail("invalid_effective_to");
 const from=input.legalEffectiveFrom??null,to=input.legalEffectiveTo??null;
 if(from&&to&&from>to)return fail("reversed_effective_range");
 if(input.autoFile===true||input.autoNotify===true||input.approved===true||input.releaseEnabled===true)return fail("activation_not_authorized");
 return ok({
  marketCode:"NA",ruleKey:key,revision:version,taskType:input.taskType,title,
  reviewQuestion:description,sourceId:snapshot.value.sourceId,
  sourceHash:snapshot.value.contentSha256,sourceUrl:snapshot.value.url,
  sourceCapturedAt:snapshot.value.capturedAt,legalEffectiveFrom:from,legalEffectiveTo:to,
  effectiveDatesStatus:"unverified",status:"research_draft",legalApproved:false,
  independentSecurityApproved:false,autoFile:false,autoNotify:false,releaseEnabled:false,
  reviewerId:null,reviewedAt:null,regulatoryPackRegistered:false
 });
}
export function checkNamibiaRuleRevisionLedger(revisions){
 if(!Array.isArray(revisions)||revisions.length>2000)return fail("invalid_revision_ledger");
 const keys=new Set();
 for(const r of revisions){
  if(!r||r.marketCode!=="NA"||r.status!=="research_draft"||r.legalApproved!==false||
    r.autoFile!==false||r.autoNotify!==false||r.releaseEnabled!==false||
    r.regulatoryPackRegistered!==false||!isHash(r.sourceHash))return fail("unapproved_revision_required");
  const key=r.ruleKey+"@"+r.revision;
  if(keys.has(key))return fail("duplicate_revision");
  keys.add(key);
 }
 return ok({marketCode:"NA",revisionCount:revisions.length,valid:true,approvedRules:0,
    activationReady:false,blockers:Object.freeze(["source_material_review","legal_effective_dates","independent_professional_review","release_authority"])});
}
export function proposeNamibiaReviewFinding(rule,form){
 if(!rule||rule.marketCode!=="NA"||rule.status!=="research_draft")return fail("research_draft_required");
 if(!form||typeof form!=="object"||Array.isArray(form))return fail("invalid_review_finding");
 const reviewer=trim(form.reviewerId,120),rationale=trim(form.rationale,2000);
 if(!reviewer||!rationale)return fail("reviewer_and_rationale_required");
 if(!["needs_source_verification","requires_legal_opinion","needs_revision","out_of_scope"].includes(form.finding))
   return fail("invalid_review_finding");
 // No "approved" state is available. Signed approval requires a separate workflow.
 return ok({
  marketCode:"NA",ruleKey:rule.ruleKey,revision:rule.revision,reviewerId:reviewer,
  finding:form.finding,rationale,sourceHash:rule.sourceHash,recordType:"review_note_draft",
  complianceApproved:false,sourceVerified:false,releaseEnabled:false
 });
}
