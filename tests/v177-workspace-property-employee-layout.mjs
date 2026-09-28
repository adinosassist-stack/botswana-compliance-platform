import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

assert.match(html,/class="nav-primary" data-view="propertyintelligence"/,"Property must be a first-class primary workspace destination");
assert.equal((html.match(/data-view="propertyintelligence"/g)||[]).length,1,"Property navigation must have one canonical control");
assert.doesNotMatch(html,/class="nav-advanced" data-view="propertyintelligence"/,"Property must not be hidden in advanced navigation");

const moneyStart=html.indexOf('<section id="moneyhub"');
const propertyStart=html.indexOf('<section id="propertyintelligence"',moneyStart);
assert.ok(moneyStart>0&&propertyStart>moneyStart,"Money and Property workspace sections must exist");
const moneySection=html.slice(moneyStart,propertyStart);
assert.doesNotMatch(moneySection,/Property Intelligence|propertyintelligence/i,"Money must not surface or route into Property Intelligence");
assert.match(html,/propertyintelligence:\["Property Intelligence","Property","property real estate rental yield mortgage cash flow investment"\]/,"Property Intelligence must be classified under Property, not Money");
assert.doesNotMatch(html,/Money · Investments/,"Property workspace must not present itself as a Money sub-area");
assert.doesNotMatch(html,/showView\('moneyhub'\)">Back to Money/,"Property workspace must not route back to Money");
const propertyFragments=[
  fs.readFileSync(new URL("../public/assets/workspace-view-fragments-20260923f.json",import.meta.url),"utf8"),
  fs.readFileSync(new URL("../public/assets/workspace-view-fragments-20260923f-4.json",import.meta.url),"utf8")
];
for(const source of propertyFragments){
  assert.doesNotMatch(source,/Money · Investments|Back to Money/,"lazy Property fragments must preserve the Property/Money separation");
}

const ownerCentre=fs.readFileSync(new URL("../public/js/owner-command-centre.js",import.meta.url),"utf8");
assert.match(ownerCentre,/function openPropertyValuationServiceRequest\(item\)/,"active property cards must have a contextual valuation-service entry helper");
assert.match(ownerCentre,/button\("Request valuation quote",\(\)=>openPropertyValuationServiceRequest\(item\),"btn"\)/,"active owner property cards must expose the valuation quote CTA");
assert.match(ownerCentre,/const select=q\("#portfolioValuationServiceProperty"\)/,"contextual quote CTA must bind to the canonical valuation-service property selector");
assert.match(ownerCentre,/Property selected\. Add the request details, then request a quote\./,"contextual quote CTA must explain the next conversion step");
assert.match(ownerCentre,/panel\.scrollIntoView\(\{behavior:"smooth",block:"center"\}\)/,"contextual quote CTA must move the user to the valuation-service form");


const createStart=html.indexOf("async function addEmployeeRecord()");
const removeStart=html.indexOf("async function removeEmployeeRecord(",createStart);
assert.ok(createStart>0&&removeStart>createStart,"employee mutation functions must exist");
const createBody=html.slice(createStart,removeStart);
for(const call of ["await renderEmployeeRegister();","await renderPeopleOperationsHub();","await renderPeopleReportingSetup();"]){
  assert.ok(createBody.includes(call),`employee create must immediately reconcile: ${call}`);
}
assert.doesNotMatch(createBody,/peopleops[^\n]{0,120}classList\.contains\("active"\)/,"employee reconciliation must not depend on People view being active");

assert.match(html,/#appShell \*\{min-width:0\}/,"workspace descendants must be allowed to shrink instead of forcing column overflow");
assert.match(html,/#appShell \.view\{overflow-x:clip\}/,"workspace views must clip accidental horizontal overflow");
assert.match(html,/\.property-layout\{display:grid;grid-template-columns:minmax\(0,1\.05fr\) minmax\(300px,\.95fr\)/,"property layout must use bounded shrinkable columns");
assert.match(html,/@media\(max-width:900px\)\{\.people-outcome-grid,\.ops-primary-grid\{grid-template-columns:1fr\}\}/,"people workspace must collapse before narrow screens");
assert.match(html,/@media\(max-width:900px\)\{\.business-outcome-grid\{grid-template-columns:1fr\}\}/,"business workspace must collapse before narrow screens");
assert.match(html,/@media\(max-width:900px\)\{\.hub-grid,\.hub-grid-3\{grid-template-columns:1fr\}/,"workspace hubs must collapse before narrow screens");

console.log("V177_WORKSPACE_ADVERSARIAL_PASS");
