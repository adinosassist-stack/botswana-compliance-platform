import fs from "node:fs";import assert from "node:assert/strict";
const html=fs.readFileSync("public/index.html","utf8"),workflow=fs.readFileSync(".github/workflows/client-runtime-identity-ci.yml","utf8");
const add=html.slice(html.indexOf("async function addEmployeeRecord()"),html.indexOf("async function removeEmployeeRecord(",html.indexOf("async function addEmployeeRecord()")));
for(const call of ["await renderEmployeeRegister();","await renderPeopleOperationsHub();","await renderPeopleReportingSetup();"])assert(add.includes(call),"employee mutation must reconcile "+call);
assert.doesNotMatch(add,/location\.reload|window\.location/,"employee mutation must not depend on reload");
assert.match(workflow,/node tests\/v256-workspace-ui-defects-browser\.mjs/);
console.log("V256_WORKSPACE_UI_DEFECTS_BROWSER_PASS");
