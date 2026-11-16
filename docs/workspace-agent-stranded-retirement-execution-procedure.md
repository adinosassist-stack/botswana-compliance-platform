# Workspace Agent — Exact-ID Worker version retirement execution design

**Status:** Preparation only. This document and companion workflow do **not** delete
a Worker version or authorize a write.

## Proven evidence

Protected eligibility run [#43778316736](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43778316736)
passed on source `2c62d99c44e030666e33ced9cc10c3cb3734c970`. Later
`main` changed, so that result is evidence of a past state, not current
authorization.

| Resource | Exact target |
| --- | --- |
| Cloudflare account | `b11d872b2660e76ca66323023b45b3ab` |
| Worker | `bw-workspace-agent-staging` |
| Candidate to retire (undeployed) | `9ba41e62-9efc-49c5-9d4e-d667057e43fb` |
| Pinned inert version to preserve | `64d9bae9-2ea3-40c1-9a26-83cea97ad71c` |
| Dedicated D1, never modify | `fa317ccc-683d-4466-9e3a-e296872d58ba` |
| Independent GitHub reviewer | `thusico` |
| Owner GitHub actor | `adinosassist-stack` |

## Decision boundaries and approvals

1. **Owner approval:** Owner must post the *exact generated statement* from
   `expectedOwnerStatement(current_main_sha)` as an unedited, authenticated
   `adinosassist-stack` comment on PR #2505. The comment must explicitly accept
   irreversible deletion of **only** the candidate Worker version and contain
   the exact current `main` SHA. General approval, “go,” past approval, or
   approval of a read-only check does not substitute for this statement.
2. **Reviewer and branch:** The separate write-capable PR must receive
   `thusico` approval and all protected CI. Owner and reviewer must be
   independent. Neither review of this draft nor the old read-only audit permits
   deletion.
3. **Protected execution:** Only an owner-triggered exact-main GitHub workflow
   gated by `workspace-agent-private-staging` with independent `thusico`
   environment approval may perform an approved write.
4. **Least privilege:** A separately provisioned staging-only API credential
   must allow version deletion for this isolated Worker/account only, as far
   as Cloudflare permits. Never use a production token and never print the
   token, full Worker JSON, or secret values.
5. **No other changes:** No deployment, activation, D1 SQL, route, custom domain,
   worker deletion, settings PATCH, secret export or update, production change,
   queue, public preview or scheduled caller.

## Prepared preflight (no DELETE)

`.github/workflows/workspace-agent-retirement-execution-readiness.yml`:

- Requires exact `main` SHA, exact candidate UUID, numeric owner comment ID,
  GitHub initiating actor `adinosassist-stack` and exact owner statement.
- Checks the independent `thusico` protected environment.
- Reads complete version pages and checks there are **exactly two** versions,
  the pinned inert one and the known undeployed candidate. Validates that
  candidate is the latest, and the pinned version is 100% deployed.
- Revalidates all safe inert variables, candidate binding topology, account
  isolation, no public routes/previews/crons, and empty dedicated D1.
- Uses **only the read-only Cloudflare token** and emits a no-delete result.
- Any missing or ambiguous state, altered SHA, extra version, unexpected binding,
  failed API request or refusal of independent review is a **hard stop**.

## Separately authorized execution design (not present in this PR)

Only **after** exact owner acceptance, a new write-specific PR, all required
checks, and fresh independent approval, the execution operator may:

1. Perform the complete preflight again immediately before the action, with
   all live read-only Cloudflare requests and current main source check.
2. Confirm the reviewed API operation is specifically
   `DELETE /accounts/{account_id}/workers/workers/{worker_id}/versions/{version_id}`
   with **all three exact constants above** (not `latest`, not a prefix).
   The endpoint targets a *Worker version*, not the Worker, deployment or D1.
3. Send at most **one** request to delete exactly the candidate version.
   Inspect HTTP success and JSON `success === true`; do not retry
   automatically, even on timeout or uncertain response.
4. Run read-only postconditions: the version listing and `latest` must
   contain only the pinned inert ID; Worker script settings and pinned version
   must each have **exactly eight** safe plain-text variables; deployment stays
   pinned at 100%; zones, public routes, previews, schedules, other Workers,
   and empty D1 remain unchanged.
5. Record run URL, source SHA, redacted outcome, owner comment ID and
   `thusico` reviewer approval. Never include secret values or response bodies.
6. If deletion is refused, the request outcome is ambiguous, script settings
   stay stale, or postflight differs from the pinned state, **stop**. Do not
   “repair” it with a deployment, secret round trip, D1 deletion or settings
   PATCH. Require an independent incident review.

The pure postcondition module
`scripts/workspace-agent-stranded-retirement-postcheck.mjs` and synthetic tests
are prepared for the future *write-scoped* PR. They are not execution authority.

**Do not activate Workspace Agent:** passing version retirement gates is not
approval for staging Agent invocation, customer traffic or production rollout.
