import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  ['workflow history is paginated beyond the first 100 runs without workflow_run branch filtering', bf07.includes('fetch_workflow_runs(){') && bf07.includes('/actions/workflows/$workflow/runs?$qualification&per_page=100&page=1') && bf07.includes('/actions/workflows/$workflow/runs?$qualification&per_page=100&page=2') && !bf07.includes('/actions/workflows/$workflow/runs?branch=main') && bf07.includes('p1.get("workflow_runs",[])+p2.get("workflow_runs",[])')],
  ['prior deployed release is resolved from bounded first-parent manifest merges only after exact BF-07, deploy and post-deploy smoke success', bf07.includes('git rev-list --first-parent --max-count="$MAX_RELEASE_LINEAGE_MERGES" "$base_sha"') && bf07.includes('candidate_parent_count') && bf07.includes('candidate_parent="${candidate_line[1]}"') && bf07.includes('git diff --quiet "$candidate_parent" "$candidate_sha" -- release/production.json && continue') && bf07.includes('candidate_bf07_json="$(fetch_workflow_runs bf07-seal.yml "$candidate_sha")"') && bf07.includes('candidate_deploy_json="$(fetch_workflow_runs deploy-production.yml "$candidate_sha")"') && bf07.includes('candidate_smoke_json="$(fetch_workflow_runs postdeploy-smoke.yml "$candidate_sha")"') && bf07.includes("[[ \"$candidate_bf07_success\" == '1' ]] || continue") && bf07.includes("[[ \"$candidate_deploy_success\" == '1' ]] || continue") && bf07.includes("[[ \"$candidate_smoke_success\" == '1' ]] || continue") && bf07.includes('no prior BF-07-sealed, automatically deployed production release with successful post-deploy smoke found on bounded first-parent history') && !bf07.includes('git merge-base --is-ancestor')],
  ['prior release baseline must have successful BF-07 from exact-SHA paginated history', bf07.includes('fetch_workflow_runs bf07-seal.yml "$previous_release_sha"') && bf07.includes('prior deployed release has no successful BF-07 seal on main')],
  ['prior release baseline must have successful automatic production deployment from exact-SHA paginated history', bf07.includes('fetch_workflow_runs deploy-production.yml "$previous_release_sha"') && bf07.includes('prior deployed release has no successful automatic production deployment on main')],
  ['prior release baseline must have successful automatic post-deploy smoke from exact-SHA paginated history', bf07.includes('fetch_workflow_runs postdeploy-smoke.yml "$previous_release_sha"') && bf07.includes('prior deployed release has no successful automatic post-deploy smoke on main')],
  ['prior release Phase 0 is required to have a completed automatic verdict but success is not supply-chain lineage authority', bf07.includes('fetch_workflow_runs production-launch-audit.yml "$previous_release_sha"') && bf07.includes('run.get("conclusion") in {"success","failure"}') && bf07.includes('prior deployed release has no completed automatic Phase 0 launch-audit verdict on main') && bf07.includes('Prior Phase 0 launch-audit execution confirmed:') && !bf07.includes('candidate_launch_audit_success') && !bf07.includes('prior closed release has no successful automatic Phase 0 launch audit on main')],
  ['first-parent lineage review window is bounded and capped', bf07.includes("MAX_RELEASE_LINEAGE_MERGES: '200'") && bf07.includes('MAX_RELEASE_LINEAGE_MERGES <= 200') && bf07.includes('release lineage exceeds the bounded ${MAX_RELEASE_LINEAGE_MERGES}-merge review window') && bf07.includes('${#lineage_shas[@]} <= MAX_RELEASE_LINEAGE_MERGES')],
  ['lineage Recovery CI lookup is paginated beyond the lineage cap', bf07.includes('per_page=100&page=1') && bf07.includes('per_page=100&page=2') && bf07.includes('p1.get("workflow_runs",[])+p2.get("workflow_runs",[])')],
  ['baseline lookup filters successful runs and exact-SHA evidence remains authoritative', bf07.includes('local qualification="status=success"') && bf07.includes('qualification="head_sha=$exact_sha"') && bf07.includes('fetch_workflow_runs recovery-ci.yml "$lineage_sha"') && bf07.includes('fetch_workflow_runs bf07-seal.yml "$previous_release_sha"')],
  ['direct or squash commits on first-parent release lineage fail closed', bf07.includes('unreviewed first-parent commit detected between deployed releases') && bf07.includes("[[ \"$lineage_parent_count\" == '2' ]]")],
  ['every first-parent lineage commit must be an exact merged PR on main', bf07.includes('first-parent release lineage contains a commit that is not an exact merged PR commit targeting main')],
  ['every first-parent lineage merge must have a valid GitHub signature', bf07.includes('first-parent release lineage contains a merge commit without a valid GitHub-verified signature')],
  ['substantive first-parent lineage merges still require successful Recovery CI', bf07.includes('first-parent release lineage has substantive merge without successful Recovery CI on main') && bf07.includes('lineage_recovery_state') && bf07.includes('success:*')],
  ['only manifest-only failed release attempts can enter supersession path', bf07.includes('lineage_manifest_only') && bf07.includes('release/production.json') && bf07.includes('manifest-only lineage release attempt lacks a completed failed Recovery CI') && bf07.includes('lineage_recovery_state" == failure:*')],
  ['superseded release attempt must have failed BF-07', bf07.includes('actions/workflows/bf07-seal.yml/runs?branch=main&head_sha=$lineage_sha') && bf07.includes('lineage_bf07_state" == failure:*') && bf07.includes('not proven failed-closed by BF-07')],
  ['successfully deployed release attempts can never be superseded', bf07.includes('actions/workflows/deploy-production.yml/runs?branch=main&head_sha=$lineage_sha') && bf07.includes('lineage_deploy_success') && bf07.includes('was successfully deployed and cannot be superseded')],
  ['supersession is explicitly limited to failed manifest-only release attempts', bf07.includes('Superseded failed manifest-only release attempt exempted from lineage Recovery CI') && bf07.includes('Recovery CI confirmed or narrowly superseded')],
  ['legacy metadata-only [deploy] marker authority is removed', !bf07.includes('release marker must have exactly one parent') && !bf07.includes('release marker must be metadata-only') && !bf07.includes('release authority must begin with [deploy]')],
  ['production deploy still requires exact-SHA Recovery CI', deploy.includes("await successful('recovery-ci.yml', 'Recovery CI'")],
  ['production deploy still requires exact-SHA BF-07', deploy.includes("await successful('bf07-seal.yml', 'BF-07 Supply-Chain Seal'") || deploy.includes('Triggering BF-07 run')],
  ['privileged launch audit has no direct-push authority', launchAudit.includes('workflow_run:') && !launchAudit.includes('\n  push:') && !launchAudit.includes('[launch-audit]')],
  ['Phase 0 launch audit is post-deploy rather than artifact-seal authority', launchAudit.includes('workflows: ["Production post-deploy smoke"]') && launchAudit.includes('types: [completed]')],
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

// Execute the workflow's real baseline selector against Git ancestry. The fixture
// stubs only GitHub workflow-run responses; the candidate-selection shell remains
// the exact production selector from bf07-seal.yml.
const selector = bf07.slice(
  bf07.indexOf("          previous_release_sha=''"),
  bf07.indexOf('          prior_bf07_json=')
).split('\n').map(line => line.replace(/^          /, '')).join('\n');
assert.ok(selector.includes('while IFS= read -r candidate_sha; do'));
assert.ok(selector.includes('fetch_workflow_runs bf07-seal.yml "$candidate_sha"'));
assert.ok(selector.includes('fetch_workflow_runs deploy-production.yml "$candidate_sha"'));
assert.ok(selector.includes('fetch_workflow_runs postdeploy-smoke.yml "$candidate_sha"'));

const fixture = mkdtempSync(join(tmpdir(), 'thebe-release-baseline-'));
try {
  const git = (...args) => execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release-test@example.invalid');
  mkdirSync(join(fixture, 'release'));
  writeFileSync(join(fixture, 'release/production.json'), '0\n');
  git('add', '.');
  git('commit', '-qm', 'bootstrap');

  const merge = (branch, path, value) => {
    git('checkout', '-qb', branch);
    writeFileSync(join(fixture, path), value);
    git('add', '.');
    git('commit', '-qm', branch);
    git('checkout', '-q', 'main');
    git('merge', '--no-ff', '-qm', branch, branch);
    return git('rev-parse', 'HEAD');
  };

  const release = merge('deployed-release', 'release/production.json', '1\n');
  const source = merge('ordinary-source', 'source.txt', 'source\n');
  const failedRelease = merge('failed-release', 'release/production.json', '2\n');
  writeFileSync(join(fixture, 'release/production.json'), '3\n');
  git('add', '.');
  git('commit', '-qm', 'direct manifest write');
  const direct = git('rev-parse', 'HEAD');

  const successRun = (sha, event = 'workflow_run', overrides = {}) => ({
    id: Number.parseInt(sha.slice(0, 8), 16),
    head_sha: sha,
    head_branch: 'main',
    event,
    status: 'completed',
    conclusion: 'success',
    ...overrides
  });

  const workflowMap = ({ seal = true, deployOk = true, smoke = true, candidate = release, extra = {} } = {}) => ({
    'bf07-seal.yml': [...(seal ? [successRun(candidate, 'push')] : []), ...(extra['bf07-seal.yml'] || [])],
    'deploy-production.yml': [...(deployOk ? [successRun(candidate)] : []), ...(extra['deploy-production.yml'] || [])],
    'postdeploy-smoke.yml': [...(smoke ? [successRun(candidate)] : []), ...(extra['postdeploy-smoke.yml'] || [])]
  });

  const stub = String.raw`
fetch_workflow_runs(){
  local workflow="$1"
  local exact_sha="${2:-}"
  WORKFLOW="$workflow" EXACT_SHA="$exact_sha" python3 - <<'PY'
import json, os
body=json.loads(os.environ['WORKFLOW_RUNS_JSON'])
runs=list(body.get(os.environ['WORKFLOW'], []))
sha=os.environ.get('EXACT_SHA','')
if sha:
    runs=[r for r in runs if r.get('head_sha')==sha]
print(json.dumps({'workflow_runs':runs},separators=(',',':')))
PY
}
`;

  const select = (runs, limit = 200, baseSha = direct) => spawnSync(
    'bash', ['-euo', 'pipefail', '-c', `${stub}\n${selector}\nprintf '%s' "$previous_release_sha"`],
    {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        base_sha: baseSha,
        MAX_RELEASE_LINEAGE_MERGES: String(limit),
        WORKFLOW_RUNS_JSON: JSON.stringify(runs)
      }
    }
  );

  const qualified = workflowMap();
  const result = select(qualified);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.endsWith(release), 'select sealed + automatically deployed + postdeploy-green release');

  assert.notEqual(select(workflowMap({ seal: false })).status, 0, 'missing BF-07 seal must fail closed');
  assert.notEqual(select(workflowMap({ deployOk: false })).status, 0, 'missing automatic deployment must fail closed');
  assert.notEqual(select(workflowMap({ smoke: false })).status, 0, 'missing post-deploy smoke must fail closed');

  for (const [workflow, overrides] of [
    ['bf07-seal.yml', { head_branch: 'feature' }],
    ['bf07-seal.yml', { status: 'in_progress' }],
    ['bf07-seal.yml', { conclusion: 'failure' }],
    ['deploy-production.yml', { event: 'workflow_dispatch' }],
    ['deploy-production.yml', { conclusion: 'failure' }],
    ['postdeploy-smoke.yml', { event: 'push' }],
    ['postdeploy-smoke.yml', { conclusion: 'failure' }]
  ]) {
    const map = workflowMap({
      seal: workflow !== 'bf07-seal.yml',
      deployOk: workflow !== 'deploy-production.yml',
      smoke: workflow !== 'postdeploy-smoke.yml',
      extra: { [workflow]: [successRun(release, workflow === 'bf07-seal.yml' ? 'push' : 'workflow_run', overrides)] }
    });
    assert.notEqual(select(map).status, 0, `${workflow} ineligible exact-SHA evidence must fail closed`);
  }

  const directQualified = workflowMap({ candidate: direct });
  assert.notEqual(select(directQualified).status, 0, 'direct manifest commit must not become a deployed release baseline');

  const sourceQualified = workflowMap({ candidate: source });
  assert.notEqual(select(sourceQualified).status, 0, 'ordinary source merge must not become a release baseline');

  const failedReleaseOnly = workflowMap({ candidate: failedRelease });
  const failedReleaseResult = select(failedReleaseOnly);
  assert.equal(failedReleaseResult.status, 0, failedReleaseResult.stderr);
  assert.ok(failedReleaseResult.stdout.endsWith(failedRelease), 'a manifest merge qualifies only when its exact BF-07/deploy/smoke evidence is actually successful');

  assert.notEqual(select(qualified, 2).status, 0, 'history cap must fail closed instead of silently accepting an older release');
  assert.notEqual(select({ 'bf07-seal.yml': [], 'deploy-production.yml': [], 'postdeploy-smoke.yml': [] }).status, 0, 'missing deployed-release evidence must fail closed');

  // Reproduce the historical depth condition: a valid deployed baseline can sit
  // outside a smaller bound, while the configured 200-merge bound can still find it.
  for (let i = 0; i < 151; i++) git('commit', '--allow-empty', '-qm', `history ${i}`);
  const distant = git('rev-parse', 'HEAD');
  assert.notEqual(select(qualified, 150, distant).status, 0, 'smaller historical window must fail closed when it cannot reach the baseline');
  const expanded = select(qualified, 200, distant);
  assert.equal(expanded.status, 0, expanded.stderr);
  assert.ok(expanded.stdout.endsWith(release), 'expanded bounded window finds exact sealed/deployed/smoked baseline');

  console.log('PASS real Git deployed-release baseline selection and fail-closed workflow/history boundaries');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
