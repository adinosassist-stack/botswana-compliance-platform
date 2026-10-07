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

classify_branch() {
  local name="$1"
  local tip_epoch="$2"
  local has_open_pr="$3"
  local merged_into_main="$4"
  local cutoff_epoch="$5"

  [[ "$name" == "$PREFIX"* ]] || { printf '%s\n' 'wrong-prefix'; return 1; }
  [[ "$name" != "$PREFIX" ]] || { printf '%s\n' 'empty-suffix'; return 1; }
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

  assert_case 'old merged branch qualifies' 'eligible' 'chatgpt/old-merged' "$old" 0 1 "$cutoff"
  assert_case 'recent branch is protected' 'too-recent' 'chatgpt/recent' "$recent" 0 1 "$cutoff"
  assert_case 'open PR branch is protected' 'open-pr' 'chatgpt/open-pr' "$old" 1 1 "$cutoff"
  assert_case 'unmerged branch is protected' 'not-merged-into-main' 'chatgpt/unmerged' "$old" 0 0 "$cutoff"
  assert_case 'non-chatgpt branch is outside scope' 'wrong-prefix' 'release/production' "$old" 0 1 "$cutoff"
  assert_case 'empty chatgpt prefix is invalid' 'empty-suffix' 'chatgpt/' "$old" 0 1 "$cutoff"
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
CONFIRMATION="${CONFIRMATION:-}"

[[ "$MODE" == 'dry-run' || "$MODE" == 'delete' ]] || fail "MODE must be dry-run or delete, got '$MODE'"
is_uint "$MIN_AGE_DAYS" || fail 'MIN_AGE_DAYS must be an unsigned integer'
is_uint "$MAX_DELETIONS" || fail 'MAX_DELETIONS must be an unsigned integer'
(( MIN_AGE_DAYS >= 7 && MIN_AGE_DAYS <= 3650 )) || fail 'MIN_AGE_DAYS must be between 7 and 3650'
(( MAX_DELETIONS >= 1 && MAX_DELETIONS <= 50 )) || fail 'MAX_DELETIONS must be between 1 and 50'
[[ -n "${GITHUB_REPOSITORY:-}" ]] || fail 'GITHUB_REPOSITORY is required'
[[ -n "${GH_TOKEN:-}" ]] || fail 'GH_TOKEN is required'

current_main_sha="$(gh api "/repos/${GITHUB_REPOSITORY}/branches/main" --jq '.commit.sha')"
[[ "$current_main_sha" =~ ^[0-9a-f]{40}$ ]] || fail "could not resolve current main SHA: '$current_main_sha'"

local_main_sha="$(git rev-parse refs/remotes/origin/main)"
[[ "$local_main_sha" == "$current_main_sha" ]] || fail "local origin/main is stale: local=$local_main_sha api=$current_main_sha"

if [[ "$MODE" == 'delete' ]]; then
  [[ "$EXPECTED_MAIN_SHA" =~ ^[0-9a-f]{40}$ ]] || fail 'delete mode requires EXPECTED_MAIN_SHA as a full lowercase 40-character SHA'
  [[ "$EXPECTED_MAIN_SHA" == "$current_main_sha" ]] || fail "delete mode main SHA mismatch: expected=$EXPECTED_MAIN_SHA current=$current_main_sha"
  [[ "$CONFIRMATION" == "$CONFIRM_PHRASE" ]] || fail "delete mode confirmation must exactly equal: $CONFIRM_PHRASE"
fi

now_epoch="$(date -u +%s)"
cutoff_epoch=$((now_epoch - MIN_AGE_DAYS * 86400))
cutoff_7=$((now_epoch - 7 * 86400))
cutoff_14=$((now_epoch - 14 * 86400))
cutoff_30=$((now_epoch - 30 * 86400))

open_pr_heads="$(mktemp)"
candidates="$(mktemp)"
merged_no_pr="$(mktemp)"
trap 'rm -f "$open_pr_heads" "$candidates" "$merged_no_pr"' EXIT

gh api --paginate "/repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100" --jq '.[].head.ref' | sort -u > "$open_pr_heads"

scanned=0
eligible=0
cohort_7=0
cohort_14=0
cohort_30=0
merged_no_pr_count=0
while IFS='|' read -r branch sha tip_epoch; do
  [[ -n "$branch" ]] || continue
  scanned=$((scanned + 1))

  has_open_pr=0
  grep -Fxq "$branch" "$open_pr_heads" && has_open_pr=1

  merged_into_main=0
  if git merge-base --is-ancestor "$sha" refs/remotes/origin/main; then
    merged_into_main=1
  fi

  if [[ "$has_open_pr" == '0' && "$merged_into_main" == '1' ]]; then
    printf '%s|%s|%s\n' "$branch" "$sha" "$tip_epoch" >> "$merged_no_pr"
    merged_no_pr_count=$((merged_no_pr_count + 1))
    (( tip_epoch <= cutoff_7 )) && cohort_7=$((cohort_7 + 1))
    (( tip_epoch <= cutoff_14 )) && cohort_14=$((cohort_14 + 1))
    (( tip_epoch <= cutoff_30 )) && cohort_30=$((cohort_30 + 1))
  fi

  reason=''
  rc=0
  reason="$(classify_branch "$branch" "$tip_epoch" "$has_open_pr" "$merged_into_main" "$cutoff_epoch")" || rc=$?
  if [[ "$rc" -eq 0 && "$reason" == 'eligible' ]]; then
    printf '%s|%s|%s\n' "$branch" "$sha" "$tip_epoch" >> "$candidates"
    eligible=$((eligible + 1))
  fi
done < <(git for-each-ref --format='%(refname:strip=3)|%(objectname)|%(committerdate:unix)' 'refs/remotes/origin/chatgpt/*')

{
  echo '### Stale `chatgpt/*` branch cleanup'
  echo
  echo "- Mode: \`$MODE\`"
  echo "- Current main: \`$current_main_sha\`"
  echo "- Minimum age: $MIN_AGE_DAYS days"
  echo "- Branches scanned: $scanned"
  echo "- Merged branches without open PRs: $merged_no_pr_count"
  echo "- Eligible merged branches at selected cutoff: $eligible"
  echo "- Delete safety cap: $MAX_DELETIONS"
  echo
  echo '#### Read-only age cohorts'
  echo
  echo '| Minimum age | Merged + no open PR |'
  echo '| ---: | ---: |'
  echo "| 7 days | $cohort_7 |"
  echo "| 14 days | $cohort_14 |"
  echo "| 30 days | $cohort_30 |"
  echo
  if (( merged_no_pr_count > 0 )); then
    echo '#### Oldest merged branches without open PRs'
    echo
    echo '| Branch | Expected tip | Last commit (UTC) |'
    echo '| --- | --- | --- |'
    sort -t'|' -k3,3n "$merged_no_pr" | head -20 | while IFS='|' read -r branch sha tip_epoch; do
      last_commit="$(date -u -d "@$tip_epoch" '+%Y-%m-%d')"
      echo "| \`$branch\` | \`${sha:0:12}\` | $last_commit |"
    done
    echo
  fi
  if (( eligible > 0 )); then
    echo '#### Selected-cutoff candidates'
    echo
    echo '| Branch | Expected tip | Last commit (UTC) |'
    echo '| --- | --- | --- |'
    while IFS='|' read -r branch sha tip_epoch; do
      last_commit="$(date -u -d "@$tip_epoch" '+%Y-%m-%d')"
      echo "| \`$branch\` | \`${sha:0:12}\` | $last_commit |"
    done < "$candidates"
  else
    echo 'No branches meet the selected deletion cutoff.'
  fi
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"

if [[ "$MODE" == 'dry-run' ]]; then
  echo "dry-run: $eligible branch(es) eligible at ${MIN_AGE_DAYS} days; no refs changed"
  echo "cohorts: 7d=$cohort_7 14d=$cohort_14 30d=$cohort_30 merged-no-open-pr=$merged_no_pr_count scanned=$scanned"
  echo 'oldest merged/no-open-PR branches:'
  sort -t'|' -k3,3n "$merged_no_pr" | head -20 || true
  echo 'selected-cutoff candidates:'
  cat "$candidates"
  exit 0
fi

(( eligible <= MAX_DELETIONS )) || fail "refusing deletion: $eligible eligible branches exceeds explicit MAX_DELETIONS=$MAX_DELETIONS"

if (( eligible == 0 )); then
  echo 'delete mode: no eligible refs to delete'
  exit 0
fi

while IFS='|' read -r branch expected_sha tip_epoch; do
  current_sha="$(git ls-remote --heads origin "refs/heads/$branch" | awk '{print $1}')"
  [[ -n "$current_sha" ]] || fail "branch disappeared before deletion boundary: $branch"
  [[ "$current_sha" == "$expected_sha" ]] || fail "branch advanced before deletion boundary: $branch expected=$expected_sha current=$current_sha"

  # Force-with-lease binds deletion to the exact tip classified above. If the
  # branch moves between the final read and push, Git refuses the deletion.
  git push --force-with-lease="refs/heads/$branch:$expected_sha" origin ":refs/heads/$branch"
  echo "deleted $branch at $expected_sha"
done < "$candidates"

echo "delete mode complete: removed $eligible stale merged chatgpt branch(es)"
