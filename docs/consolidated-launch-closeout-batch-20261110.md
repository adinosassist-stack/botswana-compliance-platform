# Thebe Desk — consolidated launch closeout batch (10 November 2026)

**Status: NOT FULL-LAUNCH APPROVED.** This is a coordination/acceptance artifact, not a deployable feature or evidence of live success. Re-read current `main`, live release identity and each issue immediately before action. Initial branch baseline: `9eeaee2857e8a0f05e9de077edf05284fc8607a7`.

## One batch; independent gates

| Lane | Existing owner issue / related work | Required remaining evidence | Exit / safe default |
| --- | --- | --- | --- |
| P0 bank trust and payment activation | #1874, merged test-only #2359/#2370/#2375; deferred/unmerged bank prototype #2360 | Confirm authorized Botswana bank-origin read-only source, account ownership and unique immutable transaction IDs. Positive final BWP credit must match company account, tenant, order, amount and reference. Prove atomic one-to-one allocation with real disposable D1 concurrency, audit/reversal handling and owner/customer authenticated mobile + desktop end-to-end test; logout/re-login preserves correct entitlement | **HOLD payment P0** without independently confirmed settled funds; never accept screenshot, customer reference, arbitrary CSV or owner booleans alone. Existing manual-bank process may continue with independently checked funds |
| P0 customer navigation and onboarding | #1701, Batch A customer-launch acceptance | Signed-in cold/warm route traces on desktop and mobile: dashboard → People → Documents → Employees → dashboard; click-to-paint / long tasks / console, Add Location recovery, fresh sign-up / sign-out, role visibility | **HOLD full UX signoff** until real browser traces meet agreed performance criteria |
| P0 Workspace AI Dock | #1934; existing AI dock PRs | Authenticated text chat: safe prompt, actual HTTP status, CORS/session, request ID, server response, safe error messages, wrong-tenant rejection; voice separately requires funded provider, real microphone and device test | Do not claim AI/voice works based only on static mock or synthetic fixture; advanced General AI and exports remain OFF until separately qualified |
| P0 recovery, protected release and rollback | #1950, #2354, release manifest + BF-07 | Approved recoverable backup; isolated actual restore, expiry/retention/access acceptance, rollback drill; exact-main seal published, separately authorized protected `production` approval, immutable version/traffic provenance and authenticated smoke | **HOLD production write/deployment** without current-SHA independent `thusico` and owner release authority; do not disable rulesets |
| P1 POP upload and reconciliation | #1886, #1950 | Distinct private D1/R2 and pre-070 baseline; protected rehearsal 070→071, security scans, quarantine, 375/414px UI, tenant isolation, signed intake, rollback and independent staging evidence | Keep upload/scanning flags OFF in production; receipt/POP ≠ settled credit ≠ entitlement |
| P1 owner console, subscriptions, assets, CRM and projects | #1337; existing #2251, #2249, #2290 and related PRs | Audit existing PR overlap first, group by owning schemas and dependencies; live permission-scoped dashboard read models, activation/pause rights, assets maintenance, job-costing and mobile UI with no dock collision | One cohesive per-domain PR when real runtime work remains; no speculative green scores or uncontrolled bulk merge |
| P1 Thebe Life and family finance | #2281, #2320 | Cross-workspace identity, privacy, household budget, non-custodial Motshelo, permissions, verified insurer partnership boundaries and commission disclosure | Private beta/default off until staging and product/compliance acceptance; no custody or unlicensed insurance sale |
| P2 Botswana compliance, Namibia expansion and APK | #1337, #1770 | Verified statutory sources/current rules, independent approval, Namibia country isolation, signed mobile artifact and authenticated test matrix | Regulatory logic remains explicitly unverified/default off until published review; no new country production activation |

## Sequenced execution without unnecessary small PRs

**Batch A — complete now without bank credentials or privileged writes.**
1. Inventory open PRs and identify duplicates/conflicting files before merging; preserve current authors and review requirements.
2. Maintain and strengthen offline payment owner/customer tests (merged test-only #2370 and #2375 already covered four + four negative cases); do not create repeated cosmetic PRs.
3. Audit source-level guardrails and readiness reports; record exact SHA/test URL/result. Passing offline checks qualifies **source only**.
4. Prepare anonymized real-user browser acceptance scripts for navigation, billing, signup and AI text chat; never capture tokens, statements or customer data in issue logs.
5. Preserve named owner/reviewer decision log and evidence table per gate; publish one coordinated status in #1337.

**Batch B — blocked pending credentials, external response or protected staging scope.**
1. Bank owner confirms independently obtained settled company-account credit and approved read-only FNBB product or bank-origin statement source. Do not assume South African FNB APIs apply in Botswana.
2. Owner + `thusico` separately approve a **new disposable** bank D1 qualification resource (never production, billing staging, POP staging or backup DB); run atomic replay, concurrency, failure and rollback scenarios. No real customer data.
3. Restore protected backup into isolated restore resource; prove row counts, foreign keys, retention/access and recovery. Do not claim recoverability from a bookmark alone.
4. Run only authorized POP staging 070→071 and scan/upload/tenant tests after accepted restore, schema and independent review.
5. Run authenticated signed-in desktop/mobile payment, role, replay, cancellation, reversal, refresh/re-login and AI text-chat acceptance; record redacted evidence and remaining defects.

**Batch C — release authority, not delegated to the batch runner.**
1. Coordinate temporary unrelated-merge pause only as needed; never alter branch protection.
2. Refresh exact `main` and release manifest, complete CI + review on exact head, publish actual BF-07 artifact.
3. Require owner-initiated protected production workflow and independent `thusico` approval; verify Worker release identity and rollback readiness.
4. Postdeploy smoke and bank-backed authenticated acceptance; release pause after recorded decision. Keep blocked issues OPEN until evidence exists.

## Go / no-go evidence card

For every gate capture: **scope**, **exact source SHA**, **environment + isolated resource ID where applicable**, **workflow/job URL**, **reviewer + decision**, **test inputs (sanitized)**, **observed output**, **rollback outcome**, **unresolved blocker**, **recorded timestamp**. A missing field is **UNVERIFIED**, not green. Secrets, account numbers, actual statements and personal identifiers must never be posted in public GitHub.

## Explicit stop conditions

Stop before any write/activation when: bank credit provenance or finality is ambiguous; reference/transaction ID is duplicated; owner or tenant authorization is missing; review/CI/stale SHA fails; sealed artifact was not actually uploaded; restore evidence is missing; POP schema is absent; required private source integration is unqualified. Treat failed or timed-out writes as **unknown** until read-back reconciliation, not safe-to-retry.

## Current evidence vs claims

- Merged PR #2370 and #2375 are test-only and do **not** change the live payment route.
- The latest independently recorded live production evidence in issue #1874 is Release 607 / Worker version 589. Recheck deployed identity before treating it as current.
- Production approval route relies on three authenticated owner attestations rather than a trusted bank-credit lookup/atomic allocation; this remains an identified security/acceptance gap.
- POP readiness was last recorded as `popSchemaReady:false`; no assumption of later schema activation.
- Closed PR #2360 is an isolated reference/rehearsal, not a live bank integration. The FNBB inquiry is not proof of provider approval or a returned response.

**This file creates no release authority.** No payment approval, company-bank access, D1 migration, flag change, route activation, traffic shift, cloud token edit, email, or production deployment is authorized by its contents.
