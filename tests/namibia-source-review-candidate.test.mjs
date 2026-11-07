import assert from "node:assert/strict";
import test from "node:test";
import {prepareNamibiaSourceSnapshotCandidate,namibiaSourceReviewReadiness} from "../cloudflare/src/namibia-source-review-candidate.js";
const valid={sourceId:"na_bipa_annual_duty",authority:"bipa",title:"BIPA annual duty official guidance",
  url:"https://www.bipa.na/annual-duty/",capturedAt:"2026-11-07",contentSha256:"a".repeat(64)};
test("accepted official source metadata cannot imply approved legal obligations",()=>{
 const result=prepareNamibiaSourceSnapshotCandidate(valid);
 assert.equal(result.ok,true);
 const s=result.value;
 assert.equal(s.marketCode,"NA");assert.equal(s.status,"unreviewed");
 for(const prop of ["legalInterpretationApproved","allowAutomatedDeadline","allowAutomatedFiling","allowCustomerRelease"])assert.equal(s[prop],false);
 assert.equal(s.verifiedBy,null);assert.equal(s.effectiveFrom,null);
 const review=namibiaSourceReviewReadiness(s);
 assert.equal(review.value.ready,false);
 assert.ok(review.value.blockers.length>=3);
});
test("rejects spoofed official sites, unsupported authority and missing hashes",()=>{
 const broken=[
  {...valid,url:"https://www.bipa.na.attacker.example/annual-duty/"},
  {...valid,url:"http://www.bipa.na/annual-duty/"},
  {...valid,url:"https://owner:pass@www.bipa.na/annual-duty/"},
  {...valid,url:"https://www.bipa.na/annual-duty/#hidden"},
  {...valid,authority:"namra"},
  {...valid,sourceId:"na_other_rule"},
  {...valid,capturedAt:"2026-02-30"},
  {...valid,contentSha256:"0"},
  {...valid,title:""},
  {...valid,url:"https://www.bipa.na/annual-duty/?redirect=evil"}
 ];
 for(const candidate of broken)assert.equal(prepareNamibiaSourceSnapshotCandidate(candidate).ok,false);
});
test("NamRA and FIC sources are allowed only under their exact authority",()=>{
 for(const input of [
  {...valid,sourceId:"na_namra_vat",authority:"namra",url:"https://itas.namra.org.na/taxes"},
  {...valid,sourceId:"na_fic_aml_scope",authority:"fic",url:"https://www.fic.na/"}
 ])assert.equal(prepareNamibiaSourceSnapshotCandidate(input).ok,true);
});
