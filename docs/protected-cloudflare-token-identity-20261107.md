# Thebe Desk: protected read-only GitHub secret → Cloudflare token identity

**Review-only. No identity probe is scheduled, deployed, or dispatched by this PR.**

## Why

Cloudflare account token readback identifies an active broad account-write token named
`Thebe Desk GitHub Production Deploy v2` (including D1 Write, Workers R2 Storage Write,
Workers Scripts Write and other rights). Existing `production` workflow
`.github/workflows/deploy-production.yml` reads GitHub `secrets.CLOUDFLARE_API_TOKEN`,
while the one-time recovery workflow in `operations-rehearsal` selects
`secrets.PRIVATE_BACKUP_CLOUDFLARE_TOKEN`. Token **names alone do not prove**
which Cloudflare token these secret slots currently hold. No production secret
value should be printed, copied to an issue, or sent to an untrusted endpoint.

## New protected source-verified identity check

`.github/workflows/cloudflare-token-identity-readonly.yml` adds a separate
**manual-only** `workflow_dispatch` selection. It requires exact-current-main
`expected_sha`, one `role`, an independently obtained *metadata ID*
`expected_token_id` (32 lower-case hexadecimal characters), and explicit
`confirmation=VERIFY_TOKEN_IDENTITY_READONLY`. Default confirmation is
`DO_NOT_RUN`. The PR trigger has **only offline, synthetic tests**.
The `production-deploy` job uses the existing `production` environment and its
existing `CLOUDFLARE_API_TOKEN` secret; the `isolated-recovery` job uses
`operations-rehearsal` and `PRIVATE_BACKUP_CLOUDFLARE_TOKEN` only.
Preserve existing independent reviewers, main-only restrictions and self-review
prohibition; do not add an unprotected fallback job.

The isolated step checks current main by authenticated GitHub read-only GET,
then verifies **the actual environment secret token** against Cloudflare's
account-token `GET /accounts/{account_id}/tokens/verify`, compares the returned
opaque token ID with the separately supplied ID, and rechecks main. It emits
only flags and a disposition, not the token ID, token value, or provider body.
If the existing secret is a *user-owned* API token instead of an account-owned
token, account verify may reject it: this is a safe HOLD, not evidence the token
is inactive. Do not copy its value into another role to debug this failure.

## Important limitations

A positive `providerTokenIdMatched` identifies one **currently accessible**
account token behind that protected GitHub secret, but proves **neither its name
nor privileges** and cannot independently establish least privilege, other user
tokens, the location of S3/R2 access keys, all historical Worker bindings,
exclusive target writers or object-lock enforcement. Even if the compared token
ID belongs to an allowlisted credential, the security reviewer must
independently compare that token's live Cloudflare policy metadata and verify
the correct secret scope. New token creation, staging validation and a controlled
credential rotation/cutover remain separate owner-authorized work.

No SQL import, R2/D1 writes, changes to the live token, permission modification,
production deployment, approval creation, POP migrations, payments or AI flags
are triggered by this workflow. Neither a successful run nor a reviewer-approved
PR substitutes for separate authenticated exact-current-main owner and
`thusico` restore approval comments in issue #1950. Track #1950 and #2187.

## Failed first protected identity check and diagnostics update

Following protected merge of PR #2228, a manual read-only production-role
check [workflow run 42400325320](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42400325320)
was dispatched on exact main `5553e904f9be8652e65718d5099d36847d0762ec`
with the public Cloudflare account-token *metadata ID* for the token named
`Thebe Desk GitHub Production Deploy v2`. The `qualify` job succeeded,
`production` returned a fail-closed `HOLD`, and `recovery` was skipped.
The job log masked the credential value; the original runner intentionally did not
explain whether the failure was identity mismatch, refusal, user-owned token,
or other validation. **No token-to-secret mapping was established.** No
production deployment, restore, secret change, or token rotation occurred.

This reviewed follow-up adds only a fixed, sanitized failure-reason category
(`authority`, `connection`, `provider_refused`, `provider_response`,
`stale_main`, `inactive_or_unverified`, `token_id_mismatch`, or `unclassified`)
to future protected job logs. It never prints the provider's response, token values,
token IDs, original exception text or any header. One must not replay a failed
protected run solely to force a token match; recheck independent environment
review and exact current main first. A `token_id_mismatch` would only prove the
current secret is **not** the independently selected account token; it would not
identify its owner or establish absence of privileged alternative credentials.

## 7 November 2026 — Stage-qualified read-only diagnostic refinement

On merged main `6ca96b5d22adbc1fb7a9263fcef41c52aced1291`, the second protected production identity check [run 42401002641](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42401002641) completed with qualification SUCCESS, production FAILURE, recovery SKIPPED. The sanitized reason was `provider_refused`, which was common to both the GitHub exact-main GET and Cloudflare account-token verification GET. Separately, the connected Cloudflare token's own `/accounts/{account_id}/tokens/verify` returned HTTP 401 Invalid API Token, but that is **not** the protected GitHub secret; it cannot establish which endpoint refused the protected run.

This change emits fixed **stage-qualified codes** (`github_refused`, `cloudflare_refused`, corresponding `_connection` and `_response` codes) that identify the source of a future failure, **not** the failed credential, token ownership, privileges, provider error bodies, IPs or resource identifiers. Existing revision and approval boundaries remain unchanged. Offline synthetic tests cover both provider refusals and malformed responses. Protected verification stays manual-only; no repeat run is authorized by this PR, and no token rotation or isolated SQL import is performed.

## 7 Nov 2026 — Explicit account versus user verification mode

Cloudflare documents user-owned token verification using the read-only `GET /user/tokens/verify` endpoint, distinct from account-owned `GET /accounts/{account_id}/tokens/verify`. The protected production check [run 42403717131](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42403717131) reached Cloudflare and failed with the sanitized `cloudflare_refused` result on the account-owned endpoint. That is **not** evidence that the token is user-owned.

This change adds an **explicit second diagnostic mode**; there is NO automatic fallback from one provider endpoint to another. `account-identity` retains a mandatory independently sourced 32-character account token ID and `VERIFY_TOKEN_IDENTITY_READONLY` confirmation. New `user-token-diagnostic` requires `expected_token_id=NONE` and separate `DIAGNOSE_USER_TOKEN_READONLY` confirmation, and uses ONLY `GET /user/tokens/verify`. Its result is at most `userTokenEndpointAccepted=true`, **never** `providerTokenIdMatched=true`. No user token identifier, value, policy, owner or provider body is logged. Both modes require exact-current-main before and after, existing protected environment review, and retain `restoreAuthorized=false`, `productionWriteAuthorized=false`, and `credentialRotationAuthorized=false`. A user endpoint acceptance alone does not establish token ownership, intended principal scope or deployment suitability; independent review of policy metadata is required.

This PR does not dispatch either protected diagnostic, create or rotate any credential, change protected environments, deploy, migrate POP, activate payment/AI, or authorize isolated SQL restore. Recheck exact current main and independent environment approvals before any separate manual verification run.
