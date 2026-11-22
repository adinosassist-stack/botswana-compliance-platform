import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const start=html.indexOf('<div class="modal" id="onboardModal"');
const end=html.indexOf('<div class="modal"',start+1);
assert.ok(start>0&&end>start,"Owner quick start is a bounded dialog");
const modal=html.slice(start,end);

test("owner quick-start dialog announces the visible heading",()=>{
 assert.match(modal,/<div class="modal" id="onboardModal" role="dialog" aria-modal="true" aria-labelledby="onboardQuickstartTitle">/);
 assert.match(modal,/<h2 id="onboardQuickstartTitle">Get to your first protection check<\/h2>/);
 assert.doesNotMatch(modal,/aria-label="Onboard"/);
});

const facts=[
 ["wPremises","Uses business premises","Shop, office"],
 ["wManufacturing","Manufactures or processes goods","industrial/manufacturing"],
 ["wData","Handles customer personal information","Names, phone numbers"],
 ["wTender","Submits tenders or bids","formal tender submissions"]
];
for(const [id,name,help] of facts){
 test(id+" uses its visible label, not an abbreviated override",()=>{
  const row=modal.match(new RegExp('<label class="onboarding-fact"><input id="'+id+'" type="checkbox" aria-labelledby="'+id+'Label" aria-describedby="'+id+'Help"><span><b id="'+id+'Label">([^<]+)</b><small id="'+id+'Help">([^<]+)</small></span></label>'));
  assert.ok(row,"checkbox must remain inside an explanatory wrapping label");
  assert.equal(row[1],name);
  assert.ok(row[2].includes(help),"visible hint must remain");
  assert.doesNotMatch(row[0],/aria-label=/,"no abbreviation may override the visible text");
 });
}

test("review updates and save failures remain announced without duplicate status landmarks",()=>{
 assert.match(modal,/id="wizardReview"[^>]*aria-live="polite"/);
 assert.match(modal,/id="wizardInlineError"[^>]*role="alert" aria-live="polite"/);
 assert.doesNotMatch(modal,/id="wizardReview"[^>]*role="status"/);
});

test("owner quick start still uses existing two factual steps and no new mutation path",()=>{
 assert.equal((modal.match(/class="wizardstep(?: active)?"/g)||[]).length,2);
 assert.match(modal,/id="wizardNext"[^>]*data-bw-onclick="wizardMove\(1\)"/);
 assert.match(modal,/id="wizardBack"[^>]*data-bw-onclick="wizardMove\(-1\)"/);
});
