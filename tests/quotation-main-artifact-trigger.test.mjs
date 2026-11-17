import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../.github/workflows/quotation-private-workflow-harness.yml",import.meta.url),"utf8");
const section=(start,end)=>workflow.split(start)[1]?.split(end)[0]||"";
test("main push covers all authenticated rehearsal and receipt source changes",()=>{
 const pushed=section("  push:\n","  workflow_dispatch:");
 for(const path of [
  "server/quotation-private-workflow-harness.mjs",
  "server/quotation-synthetic-private-caller.mjs",
  "server/quotation-synthetic-auth-rehearsal-contract.mjs",
  "tests/quotation-synthetic-auth-rehearsal-contract.test.mjs",
  "scripts/quotation-staging-bundle-hash.mjs",
  "scripts/quotation-private-activation-readiness.mjs",
  ".github/workflows/quotation-private-workflow-harness.yml"
 ]){
  assert.ok(pushed.includes("'"+path+"'"),path);
 }
});
test("manual execution is restricted to protected main, PRs remain test-only",()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/if: github\.event_name == 'pull_request' \|\| github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/permissions:\n  contents: read/);
 assert.match(workflow,/npx wrangler deploy --dry-run/g);
 assert.doesNotMatch(workflow,/\bCLOUDFLARE_API_TOKEN\b|wrangler deploy --env production/);
});
