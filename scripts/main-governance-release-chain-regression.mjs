import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';

const bf07 = readFileSync('.github/workflows/bf07-seal.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const renderer = readFileSync('cloudflare/render-production-config.sh', 'utf8');

function qualifiedGovernanceRun(runs, sha) {
  const exact = runs.filter(run =>
    run.head_sha === sha &&
    run.head_branch === 'main' &&
    run.event === 'push'
  );
  const passed = exact.find(run => run.status === 'completed' && run.conclusion === 'success');
  if (passed) return true;
  const failed = exact.find(run => run.status === 'completed' && run.conclusion && run.conclusion !== 'success');
  if (failed) return false;
  return false;
}

function liveMainStillMatches(targetSha, liveMainSha) {
  return /^[0-9a-f]{40}$/.test(targetSha) && targetSha === liveMainSha;
}

function releaseChainQualified({ governance, recovery, bf07Seal }) {
  return governance === true && recovery === true && bf07Seal === true;
}

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

assert.equal(qualifiedGovernanceRun([
  { head_sha: A, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' }
], A), true, 'exact-SHA main push governance success must qualify');

assert.equal(qualifiedGovernanceRun([
  { head_sha: B, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success' }
], A), false, 'a successful governance run for a different SHA must not qualify');

assert.equal(qualifiedGovernanceRun([
  { head_sha: A, head_branch: 'feature', event: 'push', status: 'completed', conclusion: 'success' }
], A), false, 'a governance success off main must not qualify');

assert.equal(qualifiedGovernanceRun([
  { head_sha: A, head_branch: 'main', event: 'pull_request', status: 'completed', conclusion: 'success' }
], A), false, 'PR-event self-test success must never become production authority');

assert.equal(qualifiedGovernanceRun([
  { head_sha: A, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'failure' }
], A), false, 'failed exact-SHA governance must fail closed');

assert.equal(liveMainStillMatches(A, A), true, 'unchanged live main must qualify at the final boundary');
assert.equal(liveMainStillMatches(A, B), false, 'main advancing after qualification must invalidate stale authority');
assert.equal(liveMainStillMatches('abc', 'abc'), false, 'abbreviated SHAs must never qualify');

assert.equal(releaseChainQualified({ governance: true, recovery: true, bf07Seal: true }), true);
assert.equal(releaseChainQualified({ governance: false, recovery: true, bf07Seal: true }), false);
assert.equal(releaseChainQualified({ governance: true, recovery: false, bf07Seal: true }), false);
assert.equal(releaseChainQualified({ governance: true, recovery: true, bf07Seal: false }), false);

const requiredBf07Fragments = [
  'actions/workflows/main-governance-guard.yml/runs?branch=main&per_page=100',
  'r.get("event")=="push"',
  'release SHA is stale/non-main at BF-07 qualification boundary',
  '- name: Reconfirm exact current main at seal boundary',
  'refusing to publish stale BF-07 seal'
];
for (const fragment of requiredBf07Fragments) {
  assert.ok(bf07.includes(fragment), `BF-07 lost governance invariant: ${fragment}`);
}
assert.ok(
  bf07.includes("github.event_name == 'workflow_dispatch' ||\n      github.event_name == 'push'"),
  'BF-07 automatic release execution must be gated by the manifest-scoped main push, not merge-message formatting'
);
assert.ok(
  !bf07.includes("startsWith(github.event.head_commit.message, '[release]')") &&
  !bf07.includes('automatic release merge message must begin with [release]') &&
  !bf07.includes('release_message="$(git log -1 --format=%B "$GITHUB_SHA")"'),
  'BF-07 must not make release authority depend on mutable/default merge commit message formatting'
);

const requiredDeployFragments = [
  "await successful('main-governance-guard.yml', 'Main Governance Guard'",
  "requiredEvent: 'push'",
  "r.head_branch === 'main'",
  '- name: Reconfirm exact current main at deployment boundary',
  'refusing stale deployment at mutation boundary',
  '- name: Prepare pinned Wrangler CLI outside candidate workspace',
  '- name: Render, preflight and dry-run Cloudflare production candidate without real secrets',
  'refusing stale deployment at secret-bearing mutation boundary',
  'main advanced after runtime secret preparation; refusing deploy',
  "probe_json 'token verification'",
  "probe_json 'Worker service metadata'",
  "probe_json 'D1 binding'",
  "probe_json 'R2 binding'",
  "probe_json 'Workers AI binding'",
  "probe_json 'Workers custom-domain visibility'"
];
for (const fragment of requiredDeployFragments) {
  assert.ok(deploy.includes(fragment), `deployment lost governance invariant: ${fragment}`);
}

const bf07Boundary = bf07.indexOf('- name: Reconfirm exact current main at seal boundary');
const bf07Publish = bf07.indexOf('- name: Upload sealed artifact and BF-07 evidence');
assert.ok(bf07Boundary >= 0 && bf07Publish > bf07Boundary, 'BF-07 live-main recheck must immediately precede evidence publication');

const deployBoundary = deploy.indexOf('- name: Reconfirm exact current main at deployment boundary');
const deployMutation = deploy.indexOf('- name: Deploy exact candidate to Cloudflare');
const deployVerify = deploy.indexOf('- name: Verify live production readiness');
assert.ok(deployBoundary >= 0 && deployMutation > deployBoundary, 'live-main recheck must occur before the Cloudflare mutation');
assert.ok(deployVerify > deployMutation, 'live verification must follow the Cloudflare mutation');

const jobsIndex = deploy.indexOf('\njobs:');
const firstStepsIndex = deploy.indexOf('\n    steps:', jobsIndex);
const jobPreamble = deploy.slice(jobsIndex, firstStepsIndex);
assert.ok(!jobPreamble.includes('${{ secrets.'), 'production secrets must never be exported at job scope');

const secretAllowedSteps = new Set([
  'Diagnose Cloudflare authorization boundary',
  'Deploy exact candidate to Cloudflare'
]);
let currentStep = '<job-scope>';
for (const line of deploy.split('\n')) {
  const step = line.match(/^      - name: (.+)$/);
  if (step) currentStep = step[1];
  if (line.includes('${{ secrets.')) {
    assert.ok(secretAllowedSteps.has(currentStep), `production secret reference escaped approved step boundary: ${currentStep}`);
  }
}

const beforeMutation = deploy.slice(0, deployMutation);
const mutationSegment = deploy.slice(deployMutation, deployVerify);
assert.ok(!beforeMutation.includes('thebe-worker-secrets.json'), 'real runtime secret file must not exist before the final mutation step');
assert.ok(beforeMutation.includes('thebe-worker-secrets-dry-run.json'), 'dry-run must use a placeholder-only secret file');
assert.ok(beforeMutation.includes('PROD_CONFIG="$RUNNER_TEMP/thebe-wrangler-production.toml"'), 'rendered production config must remain outside the candidate workspace');
assert.ok(!deploy.includes('- name: Build ephemeral runtime secrets file'), 'real runtime secrets must not be materialized in a standalone pre-deploy step');
assert.ok(!deploy.includes('node scripts/cloudflare-auth-diagnostic.mjs'), 'Cloudflare token must not be exposed to a repository-controlled diagnostic script');
assert.ok(mutationSegment.includes('thebe-worker-secrets.json'), 'final mutation step must materialize the runtime secret file locally');
assert.ok(mutationSegment.includes('trap cleanup EXIT'), 'final mutation step must fail-safe cleanup secret material');
assert.ok(mutationSegment.includes('$RUNNER_TEMP/wrangler-cli/node_modules/wrangler/bin/wrangler.js'), 'final mutation must use the pre-prepared pinned Wrangler CLI');
assert.ok(!mutationSegment.includes('npx '), 'secret-bearing mutation step must not resolve or install npm packages');
assert.ok(!mutationSegment.includes('sh cloudflare/'), 'secret-bearing mutation step must not execute repository-controlled shell helpers');
assert.ok(mutationSegment.includes("grep -Eq '^[[:space:]]*\\[build\\]|^[[:space:]]*command[[:space:]]*='"), 'secret-bearing mutation must reject candidate-controlled Wrangler build commands');
assert.ok(mutationSegment.includes('id: deploy_mutation') || deploy.slice(deployMutation - 120, deployMutation).includes('id: deploy_mutation'), 'secret-bearing mutation step must publish only non-secret enablement outputs');

const readinessSegment = deploy.slice(deployVerify);
assert.ok(!readinessSegment.includes('GOOGLE_OAUTH_CLIENT_SECRET'), 'post-deploy readiness must use non-secret OAuth enablement state');
assert.ok(!readinessSegment.includes('FACEBOOK_APP_SECRET'), 'post-deploy readiness must use non-secret OAuth enablement state');
assert.ok(readinessSegment.includes('steps.deploy_mutation.outputs.google_enabled'), 'Google readiness must bind to validated non-secret mutation output');
assert.ok(readinessSegment.includes('steps.deploy_mutation.outputs.facebook_enabled'), 'Facebook readiness must bind to validated non-secret mutation output');

const rendered = execFileSync('sh', ['cloudflare/render-production-config.sh', 'cloudflare/wrangler.toml'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    D1_DATABASE_ID: '11111111-2222-3333-4444-555555555555',
    PAYMENT_PROVIDER_OVERRIDE: 'none',
    PUBLIC_APP_URL: 'https://thebedesk.com',
    PUBLIC_ORIGIN: 'https://thebedesk.com',
    TURNSTILE_SITE_KEY: 'test-turnstile-site-key',
    PLATFORM_ADMIN_EMAILS: 'admin@example.org',
    PLATFORM_REGULATORY_REVIEWERS: 'reviewer@example.org',
    EVIDENCE_SCAN_API_URL: '',
    GOOGLE_OAUTH_CLIENT_ID: '',
    GOOGLE_OAUTH_CLIENT_SECRET: '',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://thebedesk.com/api/auth/oauth/google/callback',
    FACEBOOK_APP_ID: '',
    FACEBOOK_APP_SECRET: '',
    FACEBOOK_OAUTH_REDIRECT_URI: 'https://thebedesk.com/api/auth/oauth/facebook/callback',
    EMAIL_FROM: ''
  }
});
const renderedMain = rendered.match(/^main\s*=\s*"([^"]+)"\s*$/m)?.[1];
const renderedAssets = rendered.match(/^directory\s*=\s*"([^"]+)"\s*$/m)?.[1];
assert.ok(renderedMain && isAbsolute(renderedMain), 'runner-temp Wrangler config must receive an absolute Worker entrypoint');
assert.ok(renderedAssets && isAbsolute(renderedAssets), 'runner-temp Wrangler config must receive an absolute assets directory');
assert.ok(existsSync(renderedMain), `rendered absolute Worker entrypoint must exist: ${renderedMain}`);
assert.ok(existsSync(renderedAssets), `rendered absolute assets directory must exist: ${renderedAssets}`);
assert.ok(renderedMain.endsWith('/cloudflare/src/release-governance-entry.js'), 'rendered Worker entrypoint must remain the canonical release-governance entry');
assert.ok(renderer.includes('MAIN_ENTRY="$TEMPLATE_DIR/src/release-governance-entry.js"'), 'renderer must bind the canonical Worker entrypoint to the template directory');
assert.ok(renderer.includes('ASSETS_DIRECTORY=$(CDPATH= cd -- "$TEMPLATE_DIR/../public" && pwd)'), 'renderer must bind public assets to the template-relative canonical directory');

console.log('Main governance release-chain regression: PASS');
