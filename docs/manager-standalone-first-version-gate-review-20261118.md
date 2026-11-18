# Thebe Desk Manager — isolated first Worker version: review-only qualification

**Status: PREPARATION / HOLD. NO EXECUTION AUTHORIZED BY THIS DOCUMENT.**

**Tracking:** [Issue #2599](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2599).
This file is documentation only. It introduces no executable workflow, dispatch, Cloudflare token use, Worker creation, Worker version, route, DNS record, or production mutation.

## Current read-only account inventory — 2026-11-18

| Control | Observed state |
| --- | --- |
| Standalone Cloudflare account | `f585813fa376f7c71c7d4a79254168fa` |
| Synthetic D1 | `1a2fc702-2592-491c-9f55-80e032a56dd8`; 13 approved application tables + 13 indexes, all 13 tables empty |
| Zero Trust organization | `Thebe Desk Manager Private Staging`; `deny_unmatched_requests=true`, `strict_service_token_auth=true` |
| Exact tester-only reusable Access policy | `6fc750df-7e40-492f-845d-47e6e5deab0b`; allow only `banabothem@yahoo.com`; currently detached (`app_count=0`) |
| One-time PIN IdP | `a8fac234-02d0-4f3e-a821-471cf4eee7f8` |
| Account Access applications | None |
| Account Workers and scripts | None |
| Account-scoped API token inventory | Empty; this does *not* establish whether a separate user-scoped credential exists |
| Worker hostname, ingress, preview URLs | No staging Worker yet; no protected login E2E receipts |

**Do not treat the production-account staging Access app, D1, domain ownership, or credential as resources in the standalone account.** The originally discussed hostname `manager-staging.thebedesk.com` is not evidence of a route or of cross-account Access enforcement. Separately qualify traffic flow and zone ownership before allowing any ingress. Prefer reviewing **Worker-level Access protection** for an actual Worker in the isolated account; attach no route or public hostname during first-version creation.

## Immutable source and reviewed configuration

- Manager source qualification: merged [PR #2644](https://github.com/adinosassist-stack/botswana-compliance-platform/pull/2644), merge commit `37679e8dd6174704487d281b9901d0be78123eed`.
- Standalone staging config `cloudflare/wrangler.manager-standalone-account-staging.toml`, Git blob `637476567f078621e0363cd7bb8380fd90342197`.
- Reviewed original compiled Worker SHA-256: `9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e`.
- Precisely **278** immutable public static assets; the complete manifest/content hashes must be reviewed from the approved artifact, not inferred from file count.
- Worker name: `bw-manager-invitations-functional-private-staging`.
- All manager activation/readiness flags OFF, empty public origins, `workers_dev=false`, `preview_urls=false`, no routes, no triggers, synthetic `DB` binding only plus reviewed static `ASSETS`. No production D1, R2, billing, queue or AI bindings.
- Current `scripts/manager-bootstrap-inert-api-transport.py` is pinned to **production account** `ddd23cab31928a4bb3d4998df9b26d1d`, **is not wired to a workflow**, and is **not safe to use** against the standalone account. Do not repurpose it by editing a constant in an operational runner; a separately reviewed account-specific source implementation and negative tests are required.
- The retired version-only workflow remains intentionally disabled; `wrangler versions upload` is unsuitable for initial Worker creation. Never dispatch the legacy workflow or use `wrangler deploy` as a bootstrap shortcut.

## Proposed sequence for a separately approved, supported one-shot operation

1. **Review / dry-run only.** Exact-main SHA, immutable Worker/artifact SHA-256, all asset digests, configuration blob and isolated resource IDs must be pinned together. Source-only negative tests must prove that all wrong-account, wrong-D1, wrong-artifact, preexisting Worker, public ingress, preview, route and deployment cases fail closed. Review account-scoped Workers Scripts Write token blast radius, shortest feasible expiration, protected environment, independent reviewer and audit redaction. Do not reveal any token or `SESSION_SECRET`.
2. **Separate independent execution approvals.** Owner `adinosassist-stack` and independent `thusico` must approve the **same exact revision, artifact digests, bindings, protected runner, token scope and rollback plan**. The schema approval in issue #2599 is not an upload or activation approval. If current main advances, check whether reviewed contents changed; refresh exact-source approvals where required.
3. **Only if the supported execution gate is cleared:** recheck the empty Worker/script inventory, static-assets API compatibility and zero ingress; create one inert Worker *record* with disabled subdomain/previews, read it back and verify no traffic or deployment. Upload the exact immutable assets, with final upload completion JWT verified; create one *undeployed* Worker version using the reviewed API with `deploy=false`. Refuse unclear responses or unavailable capabilities; do **not** bypass a blocked integration permission.
4. **Read-only postflight before any further action.** Record account ID, Worker ID, version ID, exact bindings/hash, zero deployments and routes/custom domains, disabled workers.dev and preview URL settings, no DNS/zone changes. Freeze the version until reviewed.
5. **Separate later Access / test gate.** Review Worker-level Access destination for the actual isolated Worker, bind the exact pre-created policy + One-time PIN, and verify deny-by-default. **Do not create an insecure test URL** just to test. Only after an independently reviewed and verified private ingress plan exists, provision an isolated `SESSION_SECRET` using a protected channel, enable *staging-only* flags as approved, test unauthenticated/non-allowlisted denial, invitation → one-time activation → replay denial → login → assigned-branch dashboard, foreign tenant/branch denial, revocation and recovery. No real customers.
6. **Production remains prohibited.** No production D1, payment, AI, DNS, public app activation, customer data import, or manager login release without an entirely separate production qualification.

## Decision requested — no implicit approval

**Owner:** `APPROVE PRIVATE_MANAGER_STANDALONE_FIRST_VERSION_REVIEWED_BOOTSTRAP` or `REQUEST CHANGES`, with new implementation commit SHA, immutable manifest hash, protected execution method, isolated account, D1, no-ingress verification and token blast-radius acceptance.

**Independent reviewer:** `thusico` must separately confirm the **same exact scope and evidence** or request changes.

Until both decisions and an approved **supported** one-shot execution capability exist, status remains **SOURCE PLAN READY / LIVE WORKER HOLD**. This review-only PR is not sufficient to authorize a Cloudflare mutation.
