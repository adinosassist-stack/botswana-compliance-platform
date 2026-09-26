import assert from "node:assert/strict";import fs from "node:fs";
const workflow=fs.readFileSync(".github/workflows/recovery-ci.yml","utf8"),pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
assert.match(workflow,/Finance Watch protected regression stack/);
assert.match(workflow,/npm run test:super-agent-watch-stack/);
const stack=String(pkg.scripts["test:super-agent-watch-stack"]||"");
for(const name of ["test:finance-finalization-sql-abort","test:finance-watch-catchup","test:system-actor-provenance","test:fresh-bootstrap-smoke","test:finance-watch-finalization-integrity","test:finance-watch-cadence-contract","test:finance-finalization-rollback-runtime","test:finance-watch-recovery-finalization","test:d1-runtime-parity"])assert.ok(stack.includes(name),`protected Finance Watch stack missing ${name}`);
console.log("v147 Finance Watch protected gate passed");
