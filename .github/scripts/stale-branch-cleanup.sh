#!/usr/bin/env bash
set -euo pipefail

PREFIX='chatgpt/'
CONFIRM_PHRASE='DELETE MERGED CHATGPT BRANCHES'

fail() {
  echo "stale-branch-cleanup: $*" >&2
  exit 1
}

is_uint() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

is_protected_history_branch() {
  case "${1:-}" in
    chatgpt/release-*|chatgpt/production-*|chatgpt/promote-production-*|chatgpt/bf07-*|chatgpt/postdeploy-*|chatgpt/current-launch-status-*|chatgpt/launch-audit-*|chatgpt/launch-authority-*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

batch_digest() {
  local file="$1"
  if [[ ! -s "$file" ]]; then
    printf '%s\n' 'none'
    return 0
  fi
  sha256sum "$file" | awk '{print $1}'
}

classify_branch() {
  local name="$1"
  local tip_epoch="$2"
  local has_open_pr="$3"
  local merged_into_main="$4"
  local cutoff_epoch="$5"

  [[ "$name" == "$PREFIX"* ]] || { printf '%s\n' 'wrong-prefix'; return 1; }
  [[ "$name" != "$PREFIX" ]] || { printf '%s\n' 'empty-suffix'; return 1; }
  is_protected_history_branch "$name" && { printf '%s\n' 'protected-history'; return 1; }
  is_uint "$tip_epoch" || { printf '%s\n' 'invalid-tip-time'; return 1; }
  (( tip_epoch <= cutoff_epoch )) || { printf '%s\n' 'too-recent'; return 1; }
  [[ "$has_open_pr" == '0' ]] || { printf '%s\n' 'open-pr'; return 1; }
  [[ "$merged_into_main" == '1' ]] || { printf '%s\n' 'not-merged-into-main'; return 1; }

  printf '%s\n' 'eligible'
  return 0
}

self_test() {
  local now=2000000000
  local cutoff=$((now - 30 * 86400))
  local old=$((cutoff - 86400))
  local recent=$((cutoff + 1))

  assert_case() {
    local label="$1" expected="$2"; shift 2
    local actual rc=0
    actual="$(classify_branch "$@")" || rc=$?
    if [[ "$actual" != "$expected" ]]; then
      fail "self-test '$label' expected '$expected', got '$actual' (rc=$rc)"
    fi
    echo "PASS $label -> $actual"
  }

  assert_case 'old merged feature branch qualifies' 'eligible' 'chatgpt/old-merged' "$old" 0 1 "$cutoff"
  assert_case 'release history is permanently protected' 'protected-history' 'chatgpt/release-410-example' "$old" 0 1 "$cutoff"
  assert_case 'production sequence history is permanently protected' 'protected-history' 'chatgpt/production-sequence-410' "$old" 0 1 "$cutoff"
  assert_case 'promotion history is permanently protected' 'protected-history' 'chatgpt/promote-production-410' "$old" 0 1 "$cutoff"
  assert_case 'BF-07 history is permanently protected' 'protected-history' 'chatgpt/bf07-example' "$old" 0 1 "$cutoff"
  assert_case 'postdeploy history is permanently protected' 'protected-history' 'chatgpt/postdeploy-example' "$old" 0 1 "$cutoff"
  assert_case 'launch audit history is permanently protected' 'protected-history' 'chatgpt/launch-audit-example' "$old" 0 1 "$cutoff"
  assert_case 'recent branch is protected' 'too-recent' 'chatgpt/recent' "$recent" 0 1 "$cutoff"
  assert_case 'open PR branch is protected' 'open-pr' 'chatgpt/open-pr' "$old" 1 1 "$cutoff"
  assert_case 'unmerged branch is protected' 'not-merged-into-main' 'chatgpt/unmerged' "$old" 0 0 "$cutoff"
  assert_case 'non-chatgpt branch is outside scope' 'wrong-prefix' 'release/production' "$old" 0 1 "$cutoff"
  assert_case 'empty chatgpt prefix is invalid' 'empty-suffix' 'chatgpt/' "$old" 0 1 "$cutoff"

  local digest_fixture digest_a digest_b empty_fixture
  digest_fixture="$(mktemp)"
  empty_fixture="$(mktemp)"
  trap 'rm -f "$digest_fixture" "$empty_fixture"' RETURN
  printf '%s\n' 'chatgpt/a|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa|100' 'chatgpt/b|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb|200' > "$digest_fixture"
  digest_a="$(batch_digest "$digest_fixture")"
  digest_b="$(batch_digest "$digest_fixture")"
  [[ "$digest_a" =~ ^[0-9a-f]{64}$ ]] || fail 'self-test batch digest must be a lowercase SHA-256'
  [[ "$digest_a" == "$digest_b" ]] || fail 'self-test batch digest must be deterministic'
  [[ "$(batch_digest "$empty_fixture")" == 'none' ]] || fail 'self-test empty batch digest must be none'
  echo "PASS deterministic reviewed-batch digest -> $digest_a"
  echo 'stale-branch-cleanup self-test PASS'
}

if [[ "${1:-}" == '--self-test' ]]; then
  self_test
  exit 0
fi

MODE="${MODE:-dry-run}"
MIN_AGE_DAYS="${MIN_AGE_DAYS:-30}"
MAX_DELETIONS="${MAX_DELETIONS:-20}"
EXPECTED_MAIN_SHA="${EXPECTED_MAIN_SHA:-}"
EXPECTED_BATCH_SHA256="${EXPECTED_BATCH_SHA256:-}"
CONFIRMATION="${CONFIRMATION:-}"

[[ "$MODE" == 'dry-run' || "$MODE" == 'delete' ]] || fail "MODE must be dry-run or delete, got '$MODE'"
is_uint "$MIN_AGE_DAYS" || fail 'MIN_AGE_DAYS must be an unsigned integer'
is_uint "$MAX_DELETIONS" || fail 'MAX_DELETIONS must be an unsigned integer'
(( MIN_AGE_DAYS >= 7 && MIN_AGE_DAYS <= 3650 )) || fail 'MIN_AGE_DAYS must be between 7 and 3650'
(( MAX_DELETIONS >= 1 && MAX_DELETIONS <= 50 )) || fail 'MAX_DELETIONS must be between 1 and 50'
[[ -n "${GITHUB_REPOSITORY:-}" ]] || fail 'GITHUB_REPOSITORY is required'
[[ -n "${GH_TOKEN:-}" ]] || fail 'GH_TOKEN is required'

if [[ "$MODE" == 'delete' ]]; then
  (( MIN_AGE_DAYS >= 30 )) || fail 'delete mode requires MIN_AGE_DAYS of at least 30; use dry-run for younger cohorts'
fi

current_main_sha="$(gh api "/repos/${GITHUB_REPOSITORY}/branches/main" --jq '.commit.sha')"
[[ "$current_main_sha" =~ ^[0-9a-f]{40}$ ]] || fail "could not resolve current main SHA: '$current_main_sha'"

local_main_sha="$(git rev-parse refs/remotes/origin/main)"
[[ "$local_main_sha" == "$current_main_sha" ]] || fail "local origin/main is stale: local=$local_main_sha api=$current_main_sha"

if [[ "$MODE" == 'delete' ]]; then
  [[ "$EXPECTED_MAIN_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'delete mode requires EXPECTED_MAIN_SHA as a full lowercase 40-character SHA'
  [[ "$EXPECTED_MAIN_SHA" == "$current_main_sha" ]] || fail "delete mode main SHA mismatch: expected=$EXPECTED_MAIN_SHA current=$current_main_sha"
  [[ "$EXPECTED_BATCH_SHA256" =~ ^[0-9a-f]{64}$ ]] || fail 'delete mode requires EXPECTED_BATCH_SHA256 from a reviewed dry-run'
  [[ "$CONFIRMATION" == "$CONFIRM_PHRASE" ]] || fail "delete mode confirmation must exactly equal: $CONFIRM_PHRASE"
fi

now_epoch="$(date -u +%s)"
cutoff_epoch=$((now_epoch - MIN_AGE_DAYS * 86400))
cutoff_7=$((now_epoch - 7 * 86400))
cutoff_14=$((now_epoch - 14 * 86400))
cutoff_30=$((now_epoch - 30 * 86400))

open_pr_heads="$(mktemp)"
candidates="$(mktemp)"
sorted_candidates="$(mktemp)"
selected_batch="$(mktemp)"
merged_no_pr="$(mktemp)"
protected_history="$(mktemp)"
trap 'rm -f "$open_pr_heads" "$candidates" "$sorted_candidates" "$selected_batch" "$merged_no_pr" "$protected_history"' EXIT

gh api --paginate "/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100" --jq '.[].head.ref' | sort -u > "$open_pr_heads"

scanned=0
eligible=0
cohort_7=0
cohort_14=0
cohort_30=0
cleanup_7=0
cleanup_14=0
cleanup_30=0
merged_no_pr_count=0
protected_history_count=0
while IFS='|' read -r branch sha tip_epoch; do
  [[ -n "$branch" ]] || continue
  scanned=$((scanned + 1))

  has_open_pr=0
  grep -Fxq "$branch" "$open_pr_heads" && has_open_pr=1

  merged_into_main=0
  if git merge-base --is-ancestor "$sha" refs/remotes/origin/main; then
    merged_into_main=1
  fi

  protected=0
  if is_protected_history_branch "$branch"; then
    protected=1
  fi

  if [[ "$has_open_pr" == '0' && "$merged_into_main" == '1' ]]; then
    printf '%s|%s|%s|%s\n' "$branch" "$sha" "$tip_epoch" "$protected" >> "$merged_no_pr"
    merged_no_pr_count=$((merged_no_pr_count + 1))
    (( tip_epoch <= cutoff_7 )) && cohort_7=$((cohort_7 + 1))
    (( tip_epoch <= cutoff_14 )) && cohort_14=$((cohort_14 + 1))
    (( tip_epoch <= cutoff_30 )) && cohort_30=$((cohort_30 + 1))

    if [[ "$protected" == '1' ]]; then
      printf '%s|%s|%s\n' "$branch" "$sha" "$tip_epoch" >> "$protected_history"
      protected_history_count=$((protected_history_count + 1))
    else
      (( tip_epoch <= cutoff_7 )) && cleanup_7=$((cleanup_7 + 1))
      (( tip_epoch <= cutoff_14 )) && cleanup_14=$((cleanup_14 + 1))
      (( tip_epoch <= cutoff_30 )) && cleanup_30=$((cleanup_30 + 1))
    fi
  fi

  reason=''
  rc=0
  reason="$(classify_branch "$branch" "$tip_epoch" "$has_open_pr" "$merged_into_main" "$cutoff_epoch")" || rc=$?
  if [[ "$rc" -eq 0 && "$reason" == 'eligible' ]]; then
    printf '%s|%s|%s\n' "$branch" "$sha" "$tip_epoch" >> "$candidates"
    eligible=$((eligible + 1))
  fi
done < <(git for-each-ref --format='%(refname:strip=3)|%(objectname)|%(committerdate:unix)' 'refs/remotes/origin/chatgpt/*')

sort -t'|' -k3,3n -k1,1 "$candidates" > "$sorted_candidates"
sed -n "1,${MAX_DELETIONS}p" "$sorted_candidates" > "$selected_batch"
selected_count="$(wc -l < "$selected_batch" | tr -d ' ')"
remaining_count=$((eligible - selected_count))
selection_digest="$(batch_digest "$selected_batch")"

{
  echo '### Stale `chatgpt/*` branch cleanup'
  echo
  echo "- Mode: \`$MODE\`"
  echo "- Current main: \`$current_main_sha\`"
  echo "- Minimum age: $MIN_AGE_DAYS days"
  echo "- Branches scanned: $scanned"
  echo "- Merged branches without open PRs: $merged_no_pr_count"
  echo "- Permanently protected release/provenance branches: $protected_history_count"
  echo "- Eligible merged branches at selected cutoff: $eligible"
  echo "- Selected oldest-first batch: $selected_count"
  echo "- Remaining after this batch: $remaining_count"
  echo "- Batch safety cap: $MAX_DELETIONS"
  echo "- Reviewed batch digest: \`$selection_digest\`"
  echo
  echo '#### Read-only age cohorts'
  echo
  echo '| Minimum age | Merged + no open PR | Cleanup-eligible family |'
  echo '| ---: | ---: | ---: |'
  echo "| 7 days | $cohort_7 | $cleanup_7 |"
  echo "| 14 days | $cohort_14 | $cleanup_14 |"
  echo "| 30 days | $cohort_30 | $cleanup_30 |"
  echo
  if (( merged_no_pr_count > 0 )); then
    echo '#### Oldest merged branches without open PRs'
    echo
    echo '| Branch | Expected tip | Last commit (UTC) | Policy |'
    echo '| --- | --- | --- | --- |'
    sort -t'|' -k3,3n -k1,1 "$merged_no_pr" | sed -n '1,20p' | while IFS='|' read -r branch sha tip_epoch protected; do
      last_commit="$(date -u -d "@$tip_epoch" '+%Y-%m-%d')"
      policy='cleanup-family'
      [[ "$protected" == '1' ]] && policy='protected-history'
      echo "| \`$branch\` | \`${sha:0:12}\` | $last_commit | $policy |"
    done
    echo
  fi
  if (( protected_history_count > 0 )); then
    echo '#### Protected release/provenance branch families'
    echo
    echo 'Release, production, promotion, BF-07, post-deploy and launch-authority/audit refs are excluded from deletion regardless of age.'
    echo
  fi
  if (( selected_count > 0 )); then
    echo '#### Reviewed oldest-first batch'
    echo
    echo '| Branch | Expected tip | Last commit (UTC) |'
    echo '| --- | --- | --- |'
    while IFS='|' read -r branch sha tip_epoch; do
      last_commit="$(date -u -d "@$tip_epoch" '+%Y-%m-%d')"
      echo "| \`$branch\` | \`${sha:0:12}\` | $last_commit |"
    done < "$selected_batch"
  else
    echo 'No branches meet the selected deletion cutoff after protected-history filtering.'
  fi
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

if [[ "$MODE" == 'dry-run' ]]; then
  echo "dry-run: $eligible branch(es) eligible at ${MIN_AGE_DAYS} days after protected-history filtering; selected oldest-first batch=$selected_count remaining=$remaining_count; no refs changed"
  echo "cohorts: 7d=$cohort_7/cleanup=$cleanup_7 14d=$cohort_14/cleanup=$cleanup_14 30d=$cohort_30/cleanup=$cleanup_30 protected-history=$protected_history_count merged-no-open-pr=$merged_no_pr_count scanned=$scanned"
  echo "reviewed-batch-sha256: $selection_digest"
  echo 'reviewed oldest-first batch:'
  cat "$selected_batch"
  exit 0
fi

if (( selected_count == 0 )); then
  echo 'delete mode: no eligible refs to delete'
  exit 0
fi

[[ "$EXPECTED_BATCH_SHA256" == "$selection_digest" ]] || fail "reviewed batch digest mismatch: expected=$EXPECTED_BATCH_SHA256 current=$selection_digest"

final_main_sha="$(gh api "/repos/${GITHUB_REPOSITORY}/branches/main" --jq '.commit.sha')"
[[ "$final_main_sha" == "$EXPECTED_MAIN_SHA" ]] || fail "main advanced before deletion boundary: expected=$EXPECTED_MAIN_SHA current=$final_main_sha"

repo_owner="${GITHUB_REPOSITORY%%/*}"
while IFS='|' read -r branch expected_sha tip_epoch; do
  is_protected_history_branch "$branch" && fail "protected-history branch reached deletion boundary: $branch"

  current_sha="$(git ls-remote --heads origin "refs/heads/$branch" | awk '{print $1}')"
  [[ -n "$current_sha" ]] || fail "branch disappeared before deletion boundary: $branch"
  [[ "$current_sha" == "$expected_sha" ]] || fail "branch advanced before deletion boundary: $branch expected=$expected_sha current=$current_sha"

  open_pr_count="$(gh api --method GET "/repos/${GITHUB_REPOSITORY}/pulls" -f state=open -f "head=${repo_owner}:${branch}" --jq 'length')"
  [[ "$open_pr_count" == '0' ]] || fail "branch gained an open PR before deletion boundary: $branch"

  git merge-base --is-ancestor "$expected_sha" refs/remotes/origin/main || fail "branch is no longer merged into reviewed main: $branch"

  # Force-with-lease binds deletion to the exact tip classified and reviewed
  # above. If the branch moves between the final read and push, Git refuses it.
  git push --force-with-lease="refs/heads/$branch:$expected_sha" origin ":refs/heads/$branch"
  echo "deleted $branch at $expected_sha"
done < "$selected_batch"

echo "delete mode complete: removed reviewed batch of $selected_count branch(es); $remaining_count eligible branch(es) remain at this cutoff"
