import { existsSync, readFileSync } from 'node:fs';

const bf07 = readFileSync('.github/workflows/bf07-seal.yml', 'utf8');
const deploy = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
const recovery = readFileSync('.github/workflows/recovery-ci.yml', 'utf8');
const launchAudit = readFileSync('.github/workflows/production-launch-audit.yml', 'utf8');
const releaseManifest = JSON.parse(readFileSync('release/production.json', 'utf8'));
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
  ['BF-07 can read Actions state', bf07.includes('actions: read')],
  ['BF-07 can read pull-request provenance', bf07.includes('pull-requests: read')],
  ['BF-07 fetches enough Git history for lineage checks', bf07.includes('fetch-depth: 0')],
  ['automatic BF-07 is scoped to main release manifest changes', bf07.includes("branches: [main]") && bf07.includes("'release/production.json'")],
  ['automatic release authority is manifest-scoped and independent of merge-message formatting', bf07.includes("github.event_name == 'workflow_dispatch' ||") && bf07.includes("github.event_name == 'push'") && !bf07.includes("startsWith(github.event.head_commit.message, '[release]')") && !bf07.includes('automatic release merge message must begin with [release]') && !bf07.includes('release_message="$(git log -1 --format=%B "$GITHUB_SHA")"')],
  ['release authority must itself be a two-parent merged PR commit', bf07.includes('release authority must be a two-parent merged PR commit')],
  ['release manifest binds to exact first parent', bf07.includes('current.sourceSha!==process.env.BASE_SHA') && bf07.includes('production release sourceSha mismatch')],
  ['release manifest sequence advances exactly once', bf07.includes('current.sequence!==previous.sequence+1') && bf07.includes('production release sequence must advance exactly once')],
  ['release manifest has a closed schema', bf07.includes("expectedKeys=['release','schema','sequence','sourceSha']") && bf07.includes('production release manifest has unexpected keys')],
  ['release merge must map to a merged PR on main', bf07.includes('/commits/$release_sha/pulls?per_page=100') && bf07.includes('merge_commit_sha') && bf07.includes('merged pull request targeting main')],
  ['release PR may modify only the production manifest', bf07.includes('/pulls/$release_pr_number/files?per_page=100') && bf07.includes('release PR may modify only release/production.json') && bf07.includes('len(files)==1')],
  ['release merge commit must be GitHub-verified', bf07.includes('$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/commits/$release_sha') && bf07.includes('release merge commit is not GitHub-verified with a valid signature')],
  ['release merge must have successful Recovery CI', bf07.includes('/actions/workflows/recovery-ci.yml/runs?branch=main&per_page=100&page=1') && bf07.includes('/actions/workflows/recovery-ci.yml/runs?branch=main&per_page=100&page=2') && bf07.includes('fetch_recovery_runs') && bf07.includes('release merge has no successful completed Recovery CI run on main')],
  ['release Recovery CI synchronization is bounded and fail-closed', bf07.includes('for attempt in $(seq 1 37)') && bf07.includes('bounded wait $attempt/36') && bf07.includes('release merge Recovery CI failed closed') && bf07.includes("[[ \"$recovery_confirmed\" == '1' ]]")],
  ['prior closed release is resolved from successful automatic Phase 0 audit ancestry', bf07.includes('production-launch-audit.yml/runs?branch=main&per_page=100') && bf07.includes('git merge-base --is-ancestor') && bf07.includes('no prior successful automatic production release audit found on the current first-parent ancestry')],
  ['prior release baseline must have successful BF-07', bf07.includes('/actions/workflows/bf07-seal.yml/runs?branch=main&per_page=100') && bf07.includes('prior closed release has no successful BF-07 seal on main')],
  ['prior release baseline must have successful automatic production deployment', bf07.includes('/actions/workflows/deploy-production.yml/runs?branch=main&per_page=100') && bf07.includes('prior closed release has no successful automatic production deployment on main')],
  ['prior release baseline must have successful automatic post-deploy smoke', bf07.includes('/actions/workflows/postdeploy-smoke.yml/runs?branch=main&per_page=100') && bf07.includes('prior closed release has no successful automatic post-deploy smoke on main')],
  ['prior release baseline must have successful automatic Phase 0 launch audit', bf07.includes('prior closed release has no successful automatic Phase 0 launch audit on main') && bf07.includes('Prior Phase 0 launch-audit release baseline confirmed')],
  ['first-parent lineage review window is bounded and capped', bf07.includes("MAX_RELEASE_LINEAGE_MERGES: '150'") && bf07.includes('MAX_RELEASE_LINEAGE_MERGES <= 150') && bf07.includes('release lineage exceeds the bounded ${MAX_RELEASE_LINEAGE_MERGES}-merge review window') && bf07.includes('${#lineage_shas[@]} <= MAX_RELEASE_LINEAGE_MERGES')],
  ['lineage Recovery CI lookup is paginated beyond the lineage cap', bf07.includes('per_page=100&page=1') && bf07.includes('per_page=100&page=2') && bf07.includes('p1.get("workflow_runs",[])+p2.get("workflow_runs",[])')],
  ['direct or squash commits on first-parent release lineage fail closed', bf07.includes('unreviewed first-parent commit detected between deployed releases') && bf07.includes("[[ \"$lineage_parent_count\" == '2' ]]")],
  ['every first-parent lineage commit must be an exact merged PR on main', bf07.includes('first-parent release lineage contains a commit that is not an exact merged PR commit targeting main')],
  ['every first-parent lineage merge must have a valid GitHub signature', bf07.includes('first-parent release lineage contains a merge commit without a valid GitHub-verified signature')],
  ['every first-parent lineage merge must have successful Recovery CI', bf07.includes('first-parent release lineage has merge commit(s) without successful Recovery CI on main')],
  ['legacy metadata-only [deploy] marker authority is removed', !bf07.includes('release marker must have exactly one parent') && !bf07.includes('release marker must be metadata-only') && !bf07.includes('release authority must begin with [deploy]')],
  ['production deploy still requires exact-SHA Recovery CI', deploy.includes("await successful('recovery-ci.yml', 'Recovery CI'")],
  ['production deploy still requires exact-SHA BF-07', deploy.includes("await successful('bf07-seal.yml', 'BF-07 Supply-Chain Seal'") || deploy.includes('Triggering BF-07 run')],
  ['privileged launch audit has no direct-push authority', launchAudit.includes('workflow_run:') && !launchAudit.includes('\n  push:') && !launchAudit.includes('[launch-audit]')],
  ['retired production mutation workflows cannot be triggered', retiredProductionMutationWorkflows.every(path => !existsSync(path))],
  ['production release manifest is valid in bootstrap or promoted state', releaseManifest.schema === 1 && releaseManifest.release === 'production' && Number.isSafeInteger(releaseManifest.sequence) && releaseManifest.sequence >= 0 && /^[0-9a-f]{40}$/.test(releaseManifest.sourceSha)],
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
