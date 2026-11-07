import assert from "node:assert/strict";
import test from "node:test";
import {
  draftNamibiaRuleRevision,checkNamibiaRuleRevisionLedger,proposeNamibiaReviewFinding
} from "../cloudflare/src/namibia-rule-review-ledger.js";
import {marketActivationReadiness} from "../cloudflare/src/market-profile.js";
import {regulatoryPackBundleForMarket} from "../cloudflare/src/regulatory-pack-registry.js";

const source={sourceId:"na_bipa_annual_duty",authority:"bipa",title:"Official BIPA annual duty source",
  url:"https://www.bipa.na/annual-duty/",capturedAt:"2026-11-07",contentSha256:"b".repeat(64)};
const rule={ruleKey:"na_bipa_annual_return",revision:1,taskType:"bipa_annual_return",
  title:"Annual return applicability",reviewQuestion:"Confirm current legal obligation and event-specific deadline",
  source};
test("rule proposal is unapproved and never deployed despite a valid source hash",()=>{
 const r=draftNamibiaRuleRevision(rule);assert.equal(r.ok,true);
 assert.equal(r.value.status,"research_draft");
 assert.equal(r.value.legalApproved,false);assert.equal(r.value.regulatoryPackRegistered,false);
 assert.equal(r.value.autoNotify,false);assert.equal(r.value.autoFile,false);
 assert.equal(r.value.legalEffectiveFrom,null);
 assert.equal(checkNamibiaRuleRevisionLedger([r.value]).value.activationReady,false);
 assert.equal(regulatoryPackBundleForMarket("NA"),null);
 assert.equal(marketActivationReadiness("NA").ready,false);
});
test("supports distinct revisions, rejects duplicates and spoofed authority",()=>{
 const one=draftNamibiaRuleRevision(rule).value;
 const two=draftNamibiaRuleRevision({...rule,revision:2}).value;
 assert.equal(checkNamibiaRuleRevisionLedger([one,two]).ok,true);
 assert.equal(checkNamibiaRuleRevisionLedger([one,one]).error,"duplicate_revision");
 assert.equal(draftNamibiaRuleRevision({...rule,taskType:"namra_vat_assessment"}).ok,false);
 assert.equal(draftNamibiaRuleRevision({...rule,source:{...source,url:"https://bipa.na.evil.test/"}}).ok,false);
});
test("rejects backward or malformed legal-effective dates and self-approval",()=>{
 for(const candidate of [
  {...rule,legalEffectiveFrom:"2026-02-30"},
  {...rule,legalEffectiveFrom:"2027-01-01",legalEffectiveTo:"2026-12-31"},
  {...rule,approved:true},{...rule,releaseEnabled:true},{...rule,autoNotify:true},
  {...rule,revision:0},
  {...rule,source:{...source,contentSha256:"fake"}}
 ])assert.equal(draftNamibiaRuleRevision(candidate).ok,false);
});
test("review findings are notes only and cannot grant compliance authority",()=>{
 const r=draftNamibiaRuleRevision(rule).value;
 const note=proposeNamibiaReviewFinding(r,{reviewerId:"synthetic-reviewer",rationale:"Need to validate latest BIPA text",finding:"requires_legal_opinion"});
 assert.equal(note.ok,true);
 assert.equal(note.value.complianceApproved,false);assert.equal(note.value.releaseEnabled,false);
 assert.equal(proposeNamibiaReviewFinding(r,{reviewerId:"synthetic-reviewer",rationale:"approve",finding:"approved"}).ok,false);
 assert.equal(proposeNamibiaReviewFinding(r,{reviewerId:"",rationale:"x",finding:"out_of_scope"}).ok,false);
});
