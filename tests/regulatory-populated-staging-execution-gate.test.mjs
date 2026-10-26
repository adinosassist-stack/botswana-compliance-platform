import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const yaml=readFileSync(new URL("../.github/workflows/regulatory-populated-staging-execution-gate.yml",import.meta.url),"utf8");
test("execution gate stays default-off, protected, read-only and non-authorizing",()=>{
 for(const s of ["default: DO_NOT_RUN","VALIDATE_STAGING_EXECUTION_GATES_ONLY","environment: regulatory-staging","contents: read","git/ref/heads/main","regulatory-staging-rehearsal-write-plan.test.mjs","GATE_ONLY"]){
   assert.ok(yaml.includes(s),s);
 }
 assert.match(yaml,/github.ref == 'refs\/heads\/main'/);
 assert.doesNotMatch(yaml,/\$\{\{\s*(?:secrets|vars)\./);
 assert.doesNotMatch(yaml,/CLOUDFLARE_API_TOKEN|wrangler\s+d1|cloudflare\.com\/client\/v4|\bcurl\b|\bwget\b|npm\s+run\s+deploy|AUTHORIZE_SYNTHETIC_STAGING_REHEARSAL/i);
});
