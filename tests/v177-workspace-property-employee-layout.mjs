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

assert.match(html,/#appShell \.view\{width:100%;max-width:100%;overflow-x:clip\}/,"workspace views must be width bounded");
assert.match(html,/#appShell \.card,#appShell \.hub-card\{max-width:100%\}/,"workspace cards must be width bounded");
assert.match(html,/@media\(max-width:760px\)[^}]*\{[^}]*grid-template-columns:1fr!important/s,"narrow workspace grids must collapse deterministically");

console.log("V177_WORKSPACE_ADVERSARIAL_PASS");
