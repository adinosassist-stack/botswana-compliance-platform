import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bf07 = readFileSync('.github/workflows/bf07-seal.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-production.yml', 'utf8');

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

const requiredDeployFragments = [
  "await successful('main-governance-guard.yml', 'Main Governance Guard'",
  "requiredEvent: 'push'",
  "r.head_branch === 'main'",
  '- name: Reconfirm exact current main at deployment boundary',
  'refusing stale deployment at mutation boundary'
];
for (const fragment of requiredDeployFragments) {
  assert.ok(deploy.includes(fragment), `deployment lost governance invariant: ${fragment}`);
}

const bf07Boundary = bf07.indexOf('- name: Reconfirm exact current main at seal boundary');
const bf07Publish = bf07.indexOf('- name: Upload sealed artifact and BF-07 evidence');
assert.ok(bf07Boundary >= 0 && bf07Publish > bf07Boundary, 'BF-07 live-main recheck must immediately precede evidence publication');

const deployBoundary = deploy.indexOf('- name: Reconfirm exact current main at deployment boundary');
const deployMutation = deploy.indexOf('- name: Deploy exact candidate to Cloudflare');
assert.ok(deployBoundary >= 0 && deployMutation > deployBoundary, 'live-main recheck must occur before the Cloudflare mutation');

console.log('Main governance release-chain regression: PASS');