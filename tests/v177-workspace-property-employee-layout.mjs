import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

assert.match(html,/class="nav-primary" data-view="propertyintelligence"/,"Property must be a first-class primary workspace destination");
assert.equal((html.match(/data-view="propertyintelligence"/g)||[]).length,1,"Property navigation must have one canonical control");
assert.doesNotMatch(html,/class="nav-advanced" data-view="propertyintelligence"/,"Property must not be hidden in advanced navigation");

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
