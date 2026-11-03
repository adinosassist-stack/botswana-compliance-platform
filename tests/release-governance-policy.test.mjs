import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const governance=readFileSync(new URL("../docs/RELEASE_GOVERNANCE.md",import.meta.url),"utf8");
const audit=readFileSync(new URL("../.github/workflows/audit-remediation-ci.yml",import.meta.url),"utf8");

test("protected-release policy requires current independent human approval and forbids stale review",()=>{
  assert.match(governance,/at least one current independent GitHub pull-request APPROVED review/);
  assert.match(governance,/designated independent reviewer is `thusico`/);
  assert.match(governance,/dismissed, stale, or superseded review is not current approval/);
  assert.match(governance,/release on \*\*HOLD\*\*/);
  assert.doesNotMatch(governance,/approval is \*\*recommended but is not a mandatory release authority\*\*/);
  assert.doesNotMatch(governance,/owner-authorized evidence-based control above is the release authority/);
});
test("policy recognizes live GitHub ruleset as separate mandatory enforcement",()=>{
  assert.match(governance,/main-production-governance/);
  assert.match(governance,/23568843/);
  assert.match(governance,/unapproved green PR blocked from merge/);
  assert.match(governance,/cannot.*prove live GitHub ruleset enforcement/);
  assert.match(governance,/BF-07 sealed artifact/);
  assert.match(governance,/separate production deployment, recovery, POP-migration and bank-cleared customer-activation authorities/);
});
test("existing named Audit remediation controls job runs policy declaration test",()=>{
  assert.match(audit,/name: Audit remediation controls/);
  assert.match(audit,/node --test tests\/release-governance-policy\.test\.mjs/);
  assert.match(audit,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});
