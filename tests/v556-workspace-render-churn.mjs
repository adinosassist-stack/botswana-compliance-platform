import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const canonical=fs.readFileSync("public/index.html","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const readiness=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const companyStart="function renderCompanies(){";
const companyEnd="function switchCompany(";
for(const [label,src] of [["canonical",canonical],["runtime",runtime]]){
  assert(src.includes(companyStart),label+" company renderer missing");
  const start=src.indexOf(companyStart),end=src.indexOf(companyEnd,start);
  assert(end>start,label+" company renderer boundary missing");
  assert.match(src.slice(start,end),/if\(sel\.options\.length===companies\.length&&companies\.every/);
  assert.match(src,/if\(options\?\.skipDataRefresh\)setTimeout\(animateViewItems,20\);if\(!options\?\.skipDataRefresh&&!options\?\.roleRedirect\)scheduleWorkspaceNavigationRender/);
}
const block=runtime.slice(runtime.indexOf(companyStart),runtime.indexOf(companyEnd,runtime.indexOf(companyStart)));
let replacements=0;
const select={options:[],replaceChildren(){replacements++;this.options=[];},appendChild(option){this.options.push(option)}};
const context=vm.createContext({document:{getElementById:id=>id==="companySelect"?select:null,createElement:()=>({})},store:{companies:[{id:"one",profile:{name:"A"}},{id:"two",profile:{name:"B"}}]},state:{id:"one"},safeId:x=>x});
vm.runInContext(block,context);
context.renderCompanies();assert.equal(replacements,1);assert.equal(select.options.length,2);
context.renderCompanies();assert.equal(replacements,1,"identical render must not modify DOM");
context.store.companies[0].profile.name="A updated";context.renderCompanies();assert.equal(replacements,2,"company rename updates selector");
context.state.id="two";context.renderCompanies();assert.equal(replacements,3,"switching active company updates selection");
assert.match(readiness,/function loadPropertyWhenVisible\(\)/);
assert.match(readiness,/window\.addEventListener\("thebe:workspace-view-change",event=>/);
assert.match(readiness,/\["propertyintelligence","industryintel"\]\.includes/);
assert.doesNotMatch(readiness,/whenThebeWorkspaceReady\(loadPropertyConstruction\)/,"Property tools should not initialize on unrelated authenticated pages");
assert.match(owner,/if\(propertyView\.classList\.contains\("active"\)\)\{\s*ensurePropertyPortfolioShell\(\)/,"Property shell should only mount on the visible view");
assert.match(owner,/const activated=records\.some\(record=>record\.type==="attributes"/);
assert.match(owner,/if\(!activated&&!missingShell\)return;/,"unrelated Property DOM changes must not retrigger portfolio reads");
console.log("PASS: unchanged company renders skip DOM mutation, only one navigation animation, and Property work is view-scoped.");
