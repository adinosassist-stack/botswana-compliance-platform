import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/regulatory-populated-rehearsal-readiness.yml",import.meta.url),"utf8");
const policy=readFileSync(new URL("../docs/regulatory-remote-populated-rehearsal-authorization.md",import.meta.url),"utf8");

test("readiness workflow cannot be silently repurposed as remote staging writer",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/default: DO_NOT_RUN/);
  assert.match(workflow,/environment: regulatory-staging/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/EXPECTED_SHA.*GITHUB_SHA/);
  assert.match(workflow,/git\/ref\/heads\/main/);
  assert.doesNotMatch(workflow,/\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow,/\$\{\{\s*vars\./);
  assert.doesNotMatch(workflow,/wrangler\s+d1\s+execute|cloudflare\.com\/client\/v4|CLOUDFLARE_API_TOKEN|REGULATORY_STAGING_BOOTSTRAP_TOKEN|REGULATORY_STAGING_CLOUDFLARE_TOKEN/i);
  assert.doesNotMatch(workflow,/\b(?:curl|wget)\b|\bnpx\s+wrangler\b/i);
  assert.match(workflow,/node --test tests\/regulatory-foundation-v18-import-rehearsal\.test\.mjs/);
});

test("remote rehearsal contract preserves authorization and non-production boundaries",()=>{
  for(const requirement of [
    "independent staging-write authorization",
    "no production database writes",
    "synthetic-only",
    "before-and-after",
    "idempotent retry",
    "stop on metadata drift",
    "source snapshots",
    "historical VAT",
    "no automatic publication",
    "no real tenant records",
    "concurrent writer"
  ])assert.ok(policy.toLowerCase().includes(requirement.toLowerCase()),requirement);
});
