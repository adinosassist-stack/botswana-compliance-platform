import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/client-runtime-postdeploy.yml','utf8');

assert.match(workflow,/workflow_run:\s*\n\s*workflows: \["Thebe Desk Production Deploy"\]/,'client runtime proof must remain bound to the production deploy workflow');
assert.match(workflow,/github\.event\.workflow_run\.conclusion == 'success'/,'postdeploy proof must remain success-gated');
assert.match(workflow,/AUDIT_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/,'postdeploy proof must remain bound to the exact deployed SHA');

const ancestorChecks=[...workflow.matchAll(/git merge-base --is-ancestor "\$target" "\$main_sha"/g)];
assert.equal(ancestorChecks.length,2,'both browser and password-recovery proofs must accept only deployed SHAs that remain ancestors of current main');

assert.doesNotMatch(workflow,/\[\[ "\$target" == "\$main_sha" \]\]/,'postdeploy authority must not require deployed SHA to still equal current main after a later merge');
assert.doesNotMatch(workflow,/refusing stale runtime proof target=.*current-main=/,'old equality-based runtime race guard must be removed');
assert.doesNotMatch(workflow,/refusing stale recovery proof target=.*current-main=/,'old equality-based recovery race guard must be removed');

const checkoutChecks=[...workflow.matchAll(/\[\[ "\$target" == "\$AUDIT_SHA" \]\]/g)];
assert.equal(checkoutChecks.length,2,'both proofs must still verify the exact deployed checkout');

assert.match(workflow,/deploy trigger SHA mismatch/,'runtime proof must still reject a deployment event whose SHA differs from AUDIT_SHA');
assert.match(workflow,/deployed SHA is not an ancestor of current main/,'lineage failure must remain explicit and fail closed');

console.log('CLIENT_RUNTIME_POSTDEPLOY_AUTHORITY_RACE_PASS');
