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
  ['qualified parent merge commit must be GitHub-verified', bf07.includes('$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/commits/$parent_sha') && bf07.includes('verification.get("verified") is True') && bf07.includes('verification.get("reason")=="valid"') && bf07.includes('qualified parent merge commit is not GitHub-verified with a valid signature')],
  ['qualified parent must have successful Recovery CI', bf07.includes('/actions/workflows/recovery-ci.yml/runs?branch=main&per_page=100') && bf07.includes('qualified parent has no successful completed Recovery CI run on main')],
  ['nearest prior deploy marker is resolved from first-parent history', bf07.includes('git rev-list --first-parent "${parent_sha}^1"') && bf07.includes('no prior [deploy] marker found on the qualified parent first-parent lineage')],
  ['prior release baseline must have successful BF-07', bf07.includes('/actions/workflows/bf07-seal.yml/runs?branch=main&per_page=100') && bf07.includes('nearest prior [deploy] marker has no successful BF-07 seal on main')],
  ['prior release baseline must have successful production deployment', bf07.includes('/actions/workflows/deploy-production.yml/runs?branch=main&per_page=100') && bf07.includes('nearest prior [deploy] marker has no successful production deployment on main')],
  ['first-parent lineage review window is bounded', bf07.includes('release lineage exceeds the bounded 25-merge review window') && bf07.includes('${#lineage_shas[@]} <= 25')],
  ['direct or squash commits on first-parent release lineage fail closed', bf07.includes('unreviewed first-parent commit detected between deployed releases') && bf07.includes("[[ \"$lineage_parent_count\" == '2' ]]")],
  ['every first-parent lineage commit must be an exact merged PR on main', bf07.includes('first-parent release lineage contains a commit that is not an exact merged PR commit targeting main')],
  ['every first-parent lineage merge must have a valid GitHub signature', bf07.includes('first-parent release lineage contains a merge commit without a valid GitHub-verified signature')],
  ['every first-parent lineage merge must have successful Recovery CI', bf07.includes('first-parent release lineage has merge commit(s) without successful Recovery CI on main')],
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
