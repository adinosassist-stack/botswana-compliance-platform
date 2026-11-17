# Quotation temporary private Workflow harness — REVIEW ONLY

## Current scope
Source preparation only. This proposal is attached to #2504 / #2542 and owner authorization comment #6939247551. It does **not** authorize Worker deployment, Workflow creation, execution, D1 mutation, R2 upload, public quotation issuance, or production changes. No new public, preview, workers.dev URL, custom route, or scheduler may be attached.

Approved quotation Worker SHA-256: `09eed552bc5ef79ff3ca6b5b57e56453c0a2326e330968d47dcab39937e93274`; approved synthetic caller SHA-256: `c1f650bf14454c5257dd827a9ef6857a2f15ece6e3918542d472b4929916340c`. Pin to reviewed original main `1172056ad4d189041a3eb15717cd7fa04b09698e`. Neither approved binary is modified by this branch.

## Protected dependencies and acceptance
- Reviewed harness binary checksum, current merged source and verified Worker/Caller version digests, pinned exact runtime bindings, independently witnessed Cloudflare read-only inventory.
- An exclusively private, authenticated invocation path that cannot be accessed through a URL/header alone. Never disclose invocation keys or private session data.
- Auth D1 `bw-quotation-auth-synthetic-staging` (`d7ad8e99-2ee4-446c-9358-0e186031571d`); quotation D1 `bw-quotation-staging` (`aec227e9-b0f2-4b00-8de0-105465c4e2d6`). No other D1; no database binding in the proposed harness.
- Exactly two service bindings, isolated to `bw-quotation-auth-private-staging` and `bw-quotation-synthetic-caller-staging`; no direct R2. Confirm scripts exist privately with no URL/route and a tested internal service call.
- Distinct session, caller, probe and operator credentials stored as protected secrets, never in configuration/CI logs. Configuration flags are neither evidence of remote verification nor substitutes for external attestations.
- Synthetic-only records/identity, no customer or banking details; verified empty baseline and before/after counts. The harness currently implements **only anonymous denial**. Its `enableWrites` guard explicitly rejects authenticated writes until their precise safe fixture is independently coded and reviewed.
- Isolated snapshot/checkpoint and **actual tested recovery**, with retained evidence. The baseline D1 bookmarks in #2504 are not proof of recovery.
- Obtain independent `thusico` source and exact operational approval, then separate owner approval for the new harness artifact. Source review and earlier two Worker binary approvals do not grant this.

## One-rehearsal plan
1. Read-only verify current source, artifact digests, both D1 UUIDs and counts, zero public routes/domains/previews, exact services and private operator access.
2. Capture Worker versions and D1 recovery checkpoints and independently test the rollback procedure on isolated synthetic data before enabling harness flags.
3. Deploy only the exact approved harness in disabled state, using private internal invocation; verify direct/public access yields denial.
4. With separate execution approval, run anonymous-denial probe. Future scope after a new reviewed change: provision synthetic manager session, PUT a draft, reopen with GET, test revision conflict, CSRF and tenant denial, and recalculate totals.
5. Inspect run receipts without customer/session/secrets; disable harness, remove Workflow trigger/binding and temporary resources through separately reviewed cleanup; independently verify no public exposure, no remaining synthetic records and restored staging baseline.
6. Any negative/unknown evidence: stop and leave disabled. Do not substitute fabricated test results for real Cloudflare execution.

## Cleanup and rollback constraints
- Record exact deployed script version and proposed rollback target **before** change; separate independent recovery authorization applies.
- On error disable internal trigger immediately; do not create a public fallback or expose a diagnostic URL.
- Revert only isolated harness version/resources. Any D1 restore requires exact target/time-travel bookmark and separate owner+thusico approval; do not restore production or assume bookmark retention.
- Enumerate and remove only explicitly approved temporary Workflow instances, bindings and secrets; verify clean live state with read-only inventory.
- Provide evidence in #2504; no automated deployment, execution or cleanup is provided by this source-only PR.

## Before merge
Run local Node/static manifest tests, Wrangler --dry-run on the harness with the pinned project lockfile, source checksum receipt, review of Workflow API compatibility and independent `thusico` approval. A green CI job alone is not Cloudflare runtime qualification.

## Consolidated offline qualification batch (2026-11-17)
The PR CI now runs existing executable Node tests for the private synthetic session verifier, service-bound quotation Worker denial, draft save/reopen/update with optimistic revision and role/CSRF/tenant negative controls **alongside** the Workflow's own fail-closed denial tests. These are test doubles and isolated in-memory D1-style stores. They do not create sessions in actual Cloudflare staging or prove that a private service binding or rollback operates remotely.

**Sign-off separation:** Passing this CI does not lift `QUOTATION_HARNESS_ENABLED=disabled`; it does not provide a private invocation path, attest live credentials, approve synthetic D1 fixture provisioning, or authorize Cloudflare deployment. Retain the approved Worker and caller executable hashes unchanged. Before any full authenticated Workflow run, create a separately reviewed source implementation for the synthetic session fixture and PUT/GET steps, record tested isolated restore evidence, and obtain separate exact-head operational approvals from owner and independent `thusico`. Do not accidentally equate the static `QUOTATION_HARNESS_ROLLBACK` setting with a proven restore.

## Exact offline binary receipt gate (next consolidated batch)

A dedicated path-scoped workflow now performs **two Wrangler `--dry-run` builds**, one for the synthetic private caller and one for the temporary Workflow harness, with dependencies installed from `package-lock.json` via `npm ci --ignore-scripts`. Each build receives an independent file-level SHA-256 manifest via `scripts/quotation-staging-bundle-hash.mjs`, tied to the exact PR head or pushed main commit SHA. The only uploaded CI artifact is **the JSON receipts**, not deployable binaries; the job has `contents: read` only and no Cloudflare token or secrets. The offline receipts expire after seven days.

Reviewer must independently verify both compiled receipts against the exact source and immutable preapproved quotation service/caller fingerprints. Source compilation and receipt availability do not establish live Cloudflare account binding identities, private operator access, tested D1 rollback, qualified secrets, a successful deployment or an approved Workflow run. Rebuild receipts after merge on exact protected main; never reuse a PR-head receipt as a main artifact. Both Worker approvals and this source-only PR are distinct from approval to create a new Worker or Workflow.

**Current private inventory baseline (read-only, see #2504):** quotation Worker exists with zero active deployments, zero bindings and secrets; synthetic caller and harness were not found (HTTP 404). Do not switch `QUOTATION_HARNESS_ENABLED` away from `disabled` solely because CI passes. All Cloudflare writes, including deploys and secrets, require separate exact-binary owner plus independent `thusico` operational authority.
