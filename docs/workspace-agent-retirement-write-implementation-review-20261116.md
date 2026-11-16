# Workspace Agent — separately reviewed exact-version DELETE implementation gate

**Status: DRAFT FOR INDEPENDENT REVIEW ONLY — NO DELETE, NO DEPLOYMENT.**
This review package is intentionally inert: it adds no workflow with write credentials and sends no Cloudflare write request. It records the exact constraints for a separate write-capable implementation PR. Do not interpret merging this document as authorization to delete.

## Evidence and current scope

- Protected **read-only** execution-readiness workflow [#43788358982](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43788358982) completed **successfully** on source SHA `347b182aab5e83c3036cf513c925291ff5badfc7`.
- Owner's source-bound statement is PR #2505 comment `6905031894` by `adinosassist-stack`, for **that SHA only**.
- Cloudflare account: `b11d872b2660e76ca66323023b45b3ab`.
- Isolated staging Worker: `bw-workspace-agent-staging`.
- ONLY undeployed candidate version: `9ba41e62-9efc-49c5-9d4e-d667057e43fb`.
- Deployed pinned inert version to preserve: `64d9bae9-2ea3-40c1-9a26-83cea97ad71c`.
- D1 to preserve empty and unchanged: `fa317ccc-683d-4466-9e3a-e296872d58ba`.
- Independent reviewer and protected-environment approver: `thusico`.

**Important:** The passing source SHA is historical evidence, *not* portable execution authority. Any new merge may change `main`. An exact fresh owner comment for the actual final `main` SHA and a newly successful protected read-only preflight are both necessary before a destructive execution.

## Required separate write-specific PR (not included here)

1. Implement a **single-target, single-attempt** version-retirement action; no alternative mutation path. The only permitted endpoint is
   `DELETE https://api.cloudflare.com/client/v4/accounts/b11d872b2660e76ca66323023b45b3ab/workers/workers/bw-workspace-agent-staging/versions/9ba41e62-9efc-49c5-9d4e-d667057e43fb`.
   Cloudflare documents this as *Delete Worker Version*, distinct from Delete Worker. Forbid `latest`, short IDs, dynamically supplied URLs, arbitrary HTTP verbs, retries, `PATCH`, and all Worker/D1 deletion endpoints.
2. Build a separate **owner-initiated** GitHub Actions manual dispatch. Inputs must pin the exact full `main` SHA, full candidate ID, owner GitHub comment ID, and a separate explicit destructive confirmation string. Require `github.ref == refs/heads/main` and `github.actor == adinosassist-stack`; compare `GITHUB_SHA` to live branch tip both before and immediately after the read-only inventory.
3. Enforce environment `workspace-agent-private-staging` with **independent `thusico` approval, self-review prevention, and main-only branch policy**, using the same verification as `.github/workflows/workspace-agent-retirement-execution-readiness.yml`. Do not reuse an approval from the previous read-only run.
4. Validate the immutable owner comment via `assessOwnerStatement` at the **new current SHA**; fail for edited comments, wrong author, wrong PR, missing irreversibility acceptance, or drift. Review that the write-specific PR has independent `thusico` PR review and green required checks.
5. Use the dedicated **staging-only, least-privilege write token** stored solely in the protected environment. Never reuse `WORKSPACE_AGENT_STAGING_READONLY_CLOUDFLARE_TOKEN`; never use production credentials. Mask secrets, avoid response-body and binding/secret logs, and keep GitHub permissions minimal.
6. Immediately before the one allowed request, run the complete live *read-only* inventory through `assessStrandedRetirement` (both version pages; exactly two expected IDs; candidate not deployed; pinned version 100%; exact safe and stranded bindings; no zones, routes, preview, schedules; one isolated Worker; dedicated empty D1). Any discrepancy or unavailable endpoint => stop before deletion.
7. Permit **at most one DELETE HTTP request** with timeout, no automatic retry. Treat any timeout, connection loss, non-2xx, malformed JSON, or JSON `success !== true` as an incident stop. Never retry or attempt an alternative repair.
8. After an unambiguous success, run the separate read-only `assessRetirementPostconditions` on fresh inventory. Verify only pinned version remains; pinned is 100% deployed; latest, script settings and pinned bindings are exactly the eight safe plain-text values; D1 empty; no zones, public URLs, custom domains, schedules, or other Workers.
9. Record redacted audit evidence: exact source SHA, owner comment ID, reviewer approval, protected workflow run URL, attempted target ID, one-request count, HTTP success classification, and postflight classifications. Never print secret values, entire API payloads, or the token.
10. If postflight fails, **stop for independent incident review**. Never deploy an inert version, patch settings, restore secrets, alter routes, delete D1, or activate the Agent as an automatic fallback.

## Review and acceptance matrix

| Gate | Present evidence | Required for actual write |
|---|---|---|
| Owner exact-scope acceptance | Comment `6905031894` for historical SHA | **Fresh exact-`main` statement** if SHA changes |
| Read-only protected preflight | Run `43788358982` passed | **Fresh same-SHA passing run immediately before write** |
| Independent PR review | This is draft review preparation | `thusico` must approve separate write-specific PR |
| Protected write execution | **Not created** | New independent `thusico` environment approval |
| Cloudflare write token | **Not requested or configured here** | Dedicated least-privilege staging-only secret |
| Cloudflare DELETE | **NOT PERFORMED** | Only after every gate above passes |
| Agent activation / customer traffic | **Prohibited** | Separate future authorization |

## Explicit non-goals

No version deletion in this PR, Worker deployment, D1 writes/deletion, secrets/settings patch, new public ingress, preview URL, scheduled caller, production changes, or Workspace Agent activation. The prior and current readiness workflows must remain strictly read-only.

## Reviewer checklist (`thusico`)

- Confirm source identity and Cloudflare documented version-delete endpoint; distinguish version deletion from Worker deletion.
- Verify single-target request is constrained to exact complete UUID and exact isolated account/Worker.
- Confirm current approval does not transfer to changed `main`; no approval reuse or self-review.
- Demand synthetic tests for mismatched SHA, extra version, candidate deployed, stale owner comment, wrong account, bad token, ambiguous response, and postcondition mismatch before any write-capable implementation is approved.
- Preserve production and the inert 100% deployed version under every failure mode.
