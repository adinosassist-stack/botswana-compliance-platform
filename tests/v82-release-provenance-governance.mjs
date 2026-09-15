import { existsSync, readFileSync } from 'node:fs';

const releaseAuthority = readFileSync('.github/workflows/release-production.yml', 'utf8');
const bf07 = readFileSync('.github/workflows/bf07-seal.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const recovery = readFileSync('.github/workflows/recovery-ci.yml', 'utf8');
const launchAudit = readFileSync('.github/workflows/production-launch-audit.yml', 'utf8');
const retiredProductionMutationWorkflows = [
  '.github/workflows/initialize-production-d1.yml',
  '.github/workflows/migrate-production-d1-043.yml',
  '.github/workflows/migrate-production-d1-044.yml',
  '.github/workflows/migrate-production-d1-045.yml',
  '.github/workflows/migrate-production-d1-046.yml',
  '.github/workflows/migrate-production-v81-delegated-authority.yml',
  '.github/workflows/recover-production-turnstile.yml'
];

const checks = [
  ['release authority listens only to exact-SHA release branches', releaseAuthority.includes("- 'release/prod-*'") && !releaseAuthority.includes('branches: [main]')],
  ['release authority has no production-secret permission surface', releaseAuthority.includes('contents: read') && releaseAuthority.includes('actions: write') && !releaseAuthority.includes('environment: production') && !releaseAuthority.includes('secrets.')],
  ['release branch name is cryptographically bound to the pushed SHA', releaseAuthority.includes('expected_ref="refs/heads/release/prod-$release_sha"') && releaseAuthority.includes('release branch must be named exactly release/prod-$release_sha')],
  ['release authority requires exact current main before dispatch', releaseAuthority.includes('/branches/main') && releaseAuthority.includes('release authority is stale/non-main') && releaseAuthority.includes('[[ "$release_sha" == "$main_sha" ]]')],
  ['release authority dispatches BF-07 on main with exact SHA input', releaseAuthority.includes('/actions/workflows/bf07-seal.yml/dispatches') && releaseAuthority.includes('"ref":"main"') && releaseAuthority.includes('"expected_sha":os.environ["RELEASE_SHA"]')],
  ['BF-07 is dispatch-only and cannot be activated by a main push', bf07.includes('workflow_dispatch:') && !bf07.includes('\n  push:')],
  ['BF-07 can read Actions state', bf07.includes('actions: read')],
  ['BF-07 can read pull-request provenance', bf07.includes('pull-requests: read')],
  ['BF-07 fetches enough Git history for lineage checks', bf07.includes('fetch-depth: 0')],
  ['BF-07 dispatch requires exact full SHA on main', bf07.includes('[[ "$EXPECTED_SHA" == "$candidate_sha" ]]') && bf07.includes("[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]") && bf07.includes('dispatch SHA mismatch')],
  ['release candidate must equal exact current main', bf07.includes('/branches/main') && bf07.includes('release candidate is not exact current main')],
  ['release candidate must be a two-parent merge commit', bf07.includes('release candidate must be a two-parent merged PR commit')],
  ['release candidate must map to an exact merged PR on main', bf07.includes('/commits/$candidate_sha/pulls?per_page=100') && bf07.includes('release candidate is not the exact merge commit of a merged pull request targeting main')],
  ['release candidate merge commit must be GitHub-verified', bf07.includes('$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/commits/$candidate_sha') && bf07.includes('release candidate merge commit is not GitHub-verified with a valid signature')],
  ['release candidate must have successful Recovery CI on main', bf07.includes('/actions/workflows/recovery-ci.yml/runs?branch=main&per_page=100') && bf07.includes('release candidate has no successful completed Recovery CI run on main')],
  ['prior release baseline is the nearest successful Phase 0 audit on first-parent history', bf07.includes('closed_release_shas=') && bf07.includes('git rev-list --first-parent "${candidate_sha}^1"') && bf07.includes('no prior fully closed production release found on candidate first-parent history')],
  ['release provenance no longer depends on metadata-only [deploy] commits', !bf07.includes('release authority must begin with [deploy]') && !bf07.includes('no prior [deploy] marker')],
  ['prior closed release must have successful BF-07', bf07.includes('/actions/workflows/bf07-seal.yml/runs?per_page=100') && bf07.includes('prior closed release has no successful BF-07 seal on main')],
  ['prior closed release must have successful production deployment', bf07.includes('/actions/workflows/deploy-production.yml/runs?per_page=100') && bf07.includes('prior closed release has no successful production deployment')],
  ['prior closed release must have successful automatic post-deploy smoke', bf07.includes('/actions/workflows/postdeploy-smoke.yml/runs?per_page=100') && bf07.includes('prior closed release has no successful automatic post-deploy smoke')],
  ['prior closed release must have successful automatic Phase 0 audit', bf07.includes('prior closed release has no successful automatic Phase 0 launch audit') && bf07.includes('Prior Phase 0 launch-audit baseline confirmed')],
  ['first-parent lineage review window is bounded', bf07.includes('release lineage exceeds the bounded 25-merge review window') && bf07.includes('${#lineage_shas[@]} <= 25')],
  ['direct or squash commits on first-parent release lineage fail closed', bf07.includes('unreviewed first-parent commit detected between closed releases') && bf07.includes("[[ \"$lineage_parent_count\" == '2' ]]")],
  ['every first-parent lineage commit must be an exact merged PR on main', bf07.includes('first-parent release lineage contains a commit that is not an exact merged PR commit targeting main')],
  ['every first-parent lineage merge must have a valid GitHub signature', bf07.includes('first-parent release lineage contains a merge commit without a valid GitHub-verified signature')],
  ['every first-parent lineage merge must have successful Recovery CI', bf07.includes('first-parent release lineage has merge commit(s) without successful Recovery CI on main')],
  ['production deploy still requires exact-SHA Recovery CI', deploy.includes("await successful('recovery-ci.yml', 'Recovery CI'")],
  ['production deploy still requires exact-SHA BF-07', deploy.includes("await successful('bf07-seal.yml', 'BF-07 Supply-Chain Seal'") || deploy.includes('Triggering BF-07 run')],
  ['privileged launch audit has no direct-push authority', launchAudit.includes('workflow_run:') && !launchAudit.includes('\n  push:') && !launchAudit.includes('[launch-audit]')],
  ['retired production mutation workflows cannot be triggered', retiredProductionMutationWorkflows.every(path => !existsSync(path))],
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
