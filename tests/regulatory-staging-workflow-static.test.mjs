import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../.github/workflows/regulatory-staging-readonly-attestation.yml",import.meta.url),"utf8");
const cli=readFileSync(new URL("../scripts/run-regulatory-staging-readonly-preflight.mjs",import.meta.url),"utf8");
const attestor=readFileSync(new URL("../scripts/regulatory-staging-readonly-attestor.mjs",import.meta.url),"utf8");

test("staging workflow can only be manually dispatched against an explicitly confirmed current main",()=>{
  assert.match(workflow,/^\s{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow,/^\s{2}(?:push|pull_request|schedule|workflow_run):\s*$/m);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/inputs\.confirmation == 'READ_ONLY_STAGING_D1'/);
  assert.match(workflow,/default: DO_NOT_RUN/);
  assert.match(workflow,/EXPECTED_SHA.*inputs\.expected_sha/);
  assert.match(workflow,/\$EXPECTED_SHA\" == \"\$GITHUB_SHA/);
  assert.match(workflow,/git rev-parse HEAD/);
  assert.match(workflow,/gh api "repos\/\$GITHUB_REPOSITORY\/git\/ref\/heads\/main"/);
  assert.match(workflow,/live_sha.*EXPECTED_SHA/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/^\s{2}contents: read$/m);
  assert.doesNotMatch(workflow,/^\s{2}contents: write$/m);
});

test("no production credentials or environment may be used by staging-only workflow",()=>{
  assert.match(workflow,/environment: regulatory-staging/);
  assert.doesNotMatch(workflow,/environment: production/);
  assert.match(workflow,/STAGING_AUDIT_ENABLED.*REGULATORY_STAGING_AUDIT_ENABLED/);
  assert.match(workflow,/STAGING_AUDIT_ENABLED.*READ_ONLY_APPROVED/);
  assert.match(workflow,/REGULATORY_STAGING_CLOUDFLARE_TOKEN/);
  assert.match(workflow,/REGULATORY_STAGING_CLOUDFLARE_ACCOUNT_ID/);
  const [setup,boundedAudit]=workflow.split("      - name: Inspect staging database using pinned SELECT-only statements");
  assert.ok(boundedAudit,"Dedicated audit step must exist");
  assert.doesNotMatch(setup,/CLOUDFLARE_API_TOKEN:/,"tests and authority check must never see staging bearer token");
  assert.match(boundedAudit,/CLOUDFLARE_API_TOKEN:/,"token must be scoped to audit step");

  assert.match(workflow,/PRODUCTION_D1_DATABASE_ID.*vars.PRODUCTION_D1_DATABASE_ID/);
  assert.match(workflow,/REGULATORY_STAGING_D1_ID.*vars.REGULATORY_STAGING_D1_ID/);
  assert.match(workflow,/REGULATORY_STAGING_D1_NAME.*vars.REGULATORY_STAGING_D1_NAME/);
  assert.doesNotMatch(workflow,/secrets\.CLOUDFLARE_API_TOKEN\b/);
  assert.doesNotMatch(workflow,/vars\.D1_DATABASE_ID\b/);
  assert.match(workflow,/REGULATORY_STAGING_D1_ID.*!=.*PRODUCTION_D1_DATABASE_ID/);
});

test("workflow verifies local safety tests and exclusively executes read-only SQL attestation",()=>{
  assert.match(workflow,/npm run test:regulatory-staging-readonly/);
  assert.match(workflow,/node scripts\/run-regulatory-staging-readonly-preflight\.mjs/);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(workflow,/retention-days: 3/);
  assert.match(workflow,/decision!=='human_review_required'/);
  assert.match(workflow,/noApprovalOrImport!==true/);
  assert.doesNotMatch(workflow,/foundation-pack\/import|wrangler\s+d1\s+execute|d1\s+execute|(?:npm\s+run|node\s+scripts)\/?migrate/i);
  assert.doesNotMatch(workflow,/\/api\/platform\/regulatory\/(?:sources\/.*\/status|rules\/.*\/advance)/);
  assert.doesNotMatch(workflow,/^(?:\s+)?- name:.*(?:Apply|Deploy|Migrate|Publish|Approve) (?:production|regulatory)/mi);
  assert.match(cli,/createStagingRegulatoryAttestor/);
  assert.doesNotMatch(cli,/\b(update|insert|delete)\s*\(/i);
  assert.match(attestor,/stagingDatabaseId\.toLowerCase\(\)===productionDatabaseId\.toLowerCase\(\)/);
  assert.match(attestor,/Object\.values\(STAGING_REGULATORY_QUERIES\)\.includes\(sql\)/);
});
