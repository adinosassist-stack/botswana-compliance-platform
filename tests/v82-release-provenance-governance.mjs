import { readFileSync } from 'node:fs';

const bf07 = readFileSync('.github/workflows/bf07-seal.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const recovery = readFileSync('.github/workflows/recovery-ci.yml', 'utf8');

const checks = [
  ['BF-07 can read Actions state', bf07.includes('actions: read')],
  ['BF-07 can read pull-request provenance', bf07.includes('pull-requests: read')],
  ['BF-07 fetches enough Git history for lineage checks', bf07.includes('fetch-depth: 0')],
  ['release authority requires a strict [deploy] prefix', bf07.includes('release authority must begin with [deploy]') && bf07.includes('^\\[deploy\\]([[:space:]]|$)')],
  ['release marker must have exactly one parent', bf07.includes('release marker must have exactly one parent')],
  ['release marker must preserve the parent tree exactly', bf07.includes('release marker must be metadata-only and preserve the qualified parent tree exactly')],
  ['qualified parent must be a two-parent merge commit', bf07.includes('qualified parent must be a two-parent merged PR commit')],
  ['qualified parent must map to a merged PR on main', bf07.includes('/commits/$parent_sha/pulls?per_page=100') && bf07.includes('merge_commit_sha') && bf07.includes('targeting main')],
  ['qualified parent must have successful Recovery CI', bf07.includes('/actions/workflows/recovery-ci.yml/runs?branch=main&per_page=100') && bf07.includes('qualified parent has no successful completed Recovery CI run on main')],
  ['production deploy still requires exact-SHA Recovery CI', deploy.includes("await successful('recovery-ci.yml', 'Recovery CI'")],
  ['production deploy still requires exact-SHA BF-07', deploy.includes("await successful('bf07-seal.yml', 'BF-07 Supply-Chain Seal'") || deploy.includes('Triggering BF-07 run')],
  ['Recovery CI executes the release provenance governance regression', recovery.includes('node tests/v82-release-provenance-governance.mjs')]
];

const failures = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
}
if (failures.length) {
  console.error(`Release provenance governance failed ${failures.length}/${checks.length} checks`);
  process.exit(1);
}
console.log(`V82 release provenance governance PASS (${checks.length}/${checks.length})`);
