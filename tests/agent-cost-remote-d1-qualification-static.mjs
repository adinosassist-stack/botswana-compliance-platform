import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(".github/workflows/agent-cost-remote-d1-qualification.yml","utf8");
const script=readFileSync("scripts/qualify-agent-cost-remote-d1.mjs","utf8");

assert.match(workflow,/\n\s*workflow_dispatch:/,"remote qualification must be manual dispatch only");
assert.doesNotMatch(workflow,/\n\s*push:/,"remote qualification must not run on push");
assert.doesNotMatch(workflow,/\n\s*pull_request:/,"remote qualification must not run on pull requests");
assert.match(workflow,/confirm_ephemeral_only/);
assert.match(workflow,/CREATE_EPHEMERAL_D1/);
assert.match(workflow,/GITHUB_REF.*refs\/heads\/main/);
assert.match(workflow,/GITHUB_ACTOR.*adinosassist-stack/);
assert.match(workflow,/EXPECTED_SHA.*GITHUB_SHA/);
assert.match(workflow,/PRODUCTION_D1_DATABASE_ID: \$\{\{ vars\.D1_DATABASE_ID \}\}/);
assert.match(workflow,/environment: production/);
assert.match(workflow,/if: always\(\)/,"cleanup must run even when qualification fails");
assert.match(workflow,/--cleanup-only/);
assert.doesNotMatch(workflow,/wrangler\s+deploy|deploy-production|release\/production\.json/);

assert.match(script,/const PREFIX="thebe-agent-cost-qual-"/);
assert.match(script,/assert\.notEqual\(databaseId,productionDatabaseId/);
assert.match(script,/assert\.notEqual\(state\.databaseId,productionDatabaseId/);
assert.match(script,/cloudflare\.com\/client\/v4\/accounts/);
assert.match(script,/Promise\.all\(/,"remote qualification must issue independent concurrent requests");
assert.match(script,/cost_reservation_budget_rejected/);
assert.match(script,/agent_cost_ledger_gaps/);
assert.match(script,/PRAGMA foreign_key_check/);
assert.match(script,/unique_run_id_rejected/);
assert.match(script,/method:\s*"DELETE"|api\("DELETE"/);
assert.match(script,/productionActivationChanged:false/);
assert.doesNotMatch(script,/thebedesk\.com|\/api\/agent|wrangler\s+deploy|release\/production\.json/);

console.log("Remote D1 qualification static safety boundaries PASS");
